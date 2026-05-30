import { describe, expect, it } from "vitest";
import { collectSnapshotTeamMembersByTeamEntryId } from "./teamEntryMemberSnapshotBackfill";

describe("collectSnapshotTeamMembersByTeamEntryId", () => {
  it("後続ラウンドの members で上書きする", () => {
    const map = collectSnapshotTeamMembersByTeamEntryId([
      {
        round: "HEAT",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "ENTRY_CLOSE",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "TEAM",
                teamEntryId: "t1",
                teamName: "A",
                clubId: null,
                clubName: null,
                members: ["旧 太郎"],
              },
            ],
          },
        ],
      },
      {
        round: "SEMI",
        generatedAt: "2026-01-02T00:00:00.000Z",
        generatedBy: "RESULT_BASED",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "TEAM",
                teamEntryId: "t1",
                teamName: "A",
                clubId: null,
                clubName: null,
                members: ["新 太郎", "佐藤 花子"],
              },
            ],
          },
        ],
      },
    ]);
    expect(map.get("t1")).toEqual(["新 太郎", "佐藤 花子"]);
  });
});

describe("overlayLiveTeamMembersOnSnapshotRoundBlock", () => {
  it("DB members が空のときはスナップショット members を維持する", async () => {
    const { overlayLiveTeamMembersOnSnapshotRoundBlock } = await import(
      "./startListEventTabDisplay"
    );
    const block = overlayLiveTeamMembersOnSnapshotRoundBlock(
      {
        round: "HEAT",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "TEAM" as const,
                teamEntryId: "t1",
                teamName: "A",
                clubId: null,
                clubName: null,
                members: ["スナップ 太郎"],
              },
            ],
          },
        ],
      },
      [
        {
          teamEntryId: "t1",
          teamName: "A",
          clubId: null,
          clubName: null,
          members: [],
        },
      ]
    );
    const team = block.heats[0]!.participants[0] as { members?: string[] };
    expect(team.members).toEqual(["スナップ 太郎"]);
  });
});

describe("overlayLiveTeamMembersFromDb", () => {
  it("DB members が空のときはスナップショット members を維持する", async () => {
    const { overlayLiveTeamMembersFromDb } = await import("./buildStartListLineupParticipants");
    const result = overlayLiveTeamMembersFromDb(
      [
        {
          teamEntryId: "t1",
          teamName: "A",
          clubId: null,
          clubName: null,
          members: ["スナップ 太郎"],
        },
      ],
      [
        {
          id: "t1",
          teamName: "A",
          club: null,
          members: [],
        },
      ]
    );
    expect(result[0]?.members).toEqual(["スナップ 太郎"]);
  });
});
