/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  collectEventIdsFromEntrySavePayload,
  countSnapshotHeatParticipants,
  eventIdsWithTeamCountChange,
  loadSnapshotHeatParticipantIds,
  participantIdSetsMatch,
  resolveEventIdsNeedingSnapshotSync,
} from "@/lib/startListSnapshotOnEntryIncrease";

const { mockEventFindMany, mockEntryFindMany, mockTeamFindMany, mockHeatMarshalStateFindMany } =
  vi.hoisted(() => ({
    mockEventFindMany: vi.fn(),
    mockEntryFindMany: vi.fn(),
    mockTeamFindMany: vi.fn(),
    mockHeatMarshalStateFindMany: vi.fn(),
  }));

vi.mock("@/server/db", () => ({
  prisma: {
    event: { findMany: mockEventFindMany },
    competitionEntry: { findMany: mockEntryFindMany },
    teamEntry: { findMany: mockTeamFindMany },
    competitionHeatMarshalState: { findMany: mockHeatMarshalStateFindMany },
  },
}));

function minimalSnapshot(
  eventId: string,
  entryIds: string[],
  type: "INDIVIDUAL" | "TEAM" = "INDIVIDUAL"
): StartListSnapshotPayload {
  const participants =
    type === "TEAM"
      ? entryIds.map((id) => ({
          kind: "TEAM" as const,
          teamEntryId: id,
          teamName: `T${id}`,
          clubId: null,
          clubName: null,
          members: [],
        }))
      : entryIds.map((id) => ({
          kind: "INDIVIDUAL" as const,
          entryId: id,
          userId: `u-${id}`,
          name: `P${id}`,
          clubId: null,
          clubName: null,
        }));
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    events: [
      {
        eventId,
        name: "Test",
        sex: "MALE",
        type,
        rounds: [
          {
            round: "HEAT",
            generatedAt: new Date().toISOString(),
            generatedBy: "RECORD_CAPTURE",
            heats: participants.length ? [{ heatIndex: 1, participants }] : [],
          },
        ],
      },
    ],
  };
}

describe("participantIdSetsMatch", () => {
  it("同一ソート済み配列なら true", () => {
    expect(participantIdSetsMatch(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("長さまたは要素が違えば false", () => {
    expect(participantIdSetsMatch(["a"], ["a", "b"])).toBe(false);
    expect(participantIdSetsMatch(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("loadSnapshotHeatParticipantIds", () => {
  it("HEAT の entryId / teamEntryId をソートして返す", () => {
    const payload = minimalSnapshot("ev1", ["e2", "e0"]);
    expect(loadSnapshotHeatParticipantIds(payload, "ev1", "INDIVIDUAL")).toEqual(["e0", "e2"]);
  });
});

describe("countSnapshotHeatParticipants", () => {
  it("HEAT ラウンドの参加者数を合計する", () => {
    const payload = minimalSnapshot("ev1", ["a", "b", "c"]);
    expect(countSnapshotHeatParticipants(payload, "ev1")).toBe(3);
  });
});

describe("eventIdsWithTeamCountChange", () => {
  it("件数が変わった種目を返す", () => {
    const before = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    const after = new Map([
      ["a", 3],
      ["b", 1],
      ["c", 1],
    ]);
    expect(eventIdsWithTeamCountChange(before, after).sort()).toEqual(["a", "c"]);
  });

  it("件数が同じなら空", () => {
    const before = new Map([["a", 2]]);
    const after = new Map([["a", 2]]);
    expect(eventIdsWithTeamCountChange(before, after)).toEqual([]);
  });

  it("減少した種目も含む", () => {
    const before = new Map([["a", 3]]);
    const after = new Map([["a", 1]]);
    expect(eventIdsWithTeamCountChange(before, after)).toEqual(["a"]);
  });
});

describe("collectEventIdsFromEntrySavePayload", () => {
  it("個人・チーム・以前の種目 id を重複除去して返す", () => {
    expect(
      collectEventIdsFromEntrySavePayload(
        [{ eventId: "i1" }],
        [{ eventId: "t1" }],
        ["old1", "i1"]
      ).sort()
    ).toEqual(["i1", "old1", "t1"]);
  });
});

describe("resolveEventIdsNeedingSnapshotSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeatMarshalStateFindMany.mockResolvedValue([]);
  });

  it("HEAT マーシャル締切済み種目は対象外", async () => {
    mockHeatMarshalStateFindMany.mockResolvedValue([{ eventId: "ev1", round: "HEAT" }]);
    const result = await resolveEventIdsNeedingSnapshotSync({
      competitionId: "c1",
      candidateEventIds: ["ev1"],
      snapshotData: minimalSnapshot("ev1", ["e0"]),
    });
    expect(result).toEqual([]);
    expect(mockEventFindMany).not.toHaveBeenCalled();
  });

  it("ライブ ID 集合がスナップショットと違えば対象", async () => {
    mockEventFindMany.mockResolvedValue([{ id: "ev1", type: "INDIVIDUAL" }]);
    mockEntryFindMany.mockResolvedValue([
      { id: "e0", participantStatuses: [] },
      { id: "e1", participantStatuses: [] },
    ]);
    const result = await resolveEventIdsNeedingSnapshotSync({
      competitionId: "c1",
      candidateEventIds: ["ev1"],
      snapshotData: minimalSnapshot("ev1", ["e0"]),
    });
    expect(result).toEqual(["ev1"]);
  });

  it("件数同じでも ID が違えば対象", async () => {
    mockEventFindMany.mockResolvedValue([{ id: "ev1", type: "INDIVIDUAL" }]);
    mockEntryFindMany.mockResolvedValue([{ id: "e9", participantStatuses: [] }]);
    const result = await resolveEventIdsNeedingSnapshotSync({
      competitionId: "c1",
      candidateEventIds: ["ev1"],
      snapshotData: minimalSnapshot("ev1", ["e0"]),
    });
    expect(result).toEqual(["ev1"]);
  });

  it("集合が一致すれば空", async () => {
    mockEventFindMany.mockResolvedValue([{ id: "ev1", type: "TEAM" }]);
    mockTeamFindMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    const result = await resolveEventIdsNeedingSnapshotSync({
      competitionId: "c1",
      candidateEventIds: ["ev1"],
      snapshotData: minimalSnapshot("ev1", ["t1", "t2"], "TEAM"),
    });
    expect(result).toEqual([]);
  });
});
