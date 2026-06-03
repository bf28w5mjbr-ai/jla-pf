/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  inferAutoNextRoundTransition,
  resolveStartListTabCountForProgression,
  evaluateNextRoundSlStatus,
} from "@/lib/startListNextRoundFromOfficial";
import { mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas } from "@/lib/startListRounds";

const {
  mockCompetitionFindUnique,
  mockOfficialResultFindUnique,
  mockOfficialResultHeatConfirmedFindMany,
  mockLoadSnapshot,
  mockGetRoundData,
  mockComputeFingerprint,
  mockIsMarshalStarted,
} = vi.hoisted(() => ({
  mockCompetitionFindUnique: vi.fn(),
  mockOfficialResultFindUnique: vi.fn(),
  mockOfficialResultHeatConfirmedFindMany: vi.fn(),
  mockLoadSnapshot: vi.fn(),
  mockGetRoundData: vi.fn(),
  mockComputeFingerprint: vi.fn(),
  mockIsMarshalStarted: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    competition: { findUnique: mockCompetitionFindUnique },
    officialResult: { findUnique: mockOfficialResultFindUnique },
    officialResultHeatConfirmed: { findMany: mockOfficialResultHeatConfirmedFindMany },
  },
}));

vi.mock("@/lib/heatMarshalGate", () => ({
  loadStartListSnapshotPayloadLoose: mockLoadSnapshot,
}));

vi.mock("@/lib/heatMarshalFromSnapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/heatMarshalFromSnapshot")>();
  return {
    ...actual,
    getRoundDataFromSnapshot: mockGetRoundData,
  };
});

vi.mock("@/lib/startListNextRoundFingerprint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/startListNextRoundFingerprint")>();
  return {
    ...actual,
    computePrevRoundOfficialFingerprint: mockComputeFingerprint,
    isNextRoundMarshalStarted: mockIsMarshalStarted,
  };
});

const heatRoundData = {
  round: "HEAT" as const,
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "BASELINE" as const,
  heats: [{ heatIndex: 1, participants: [] }, { heatIndex: 2, participants: [] }],
};

describe("inferAutoNextRoundTransition", () => {
  it("3タブ以上は HEAT→SEMI", () => {
    expect(inferAutoNextRoundTransition({ finishedRound: "HEAT", tabCount: 3 })).toEqual({
      fromRound: "HEAT",
      toRound: "SEMI",
    });
  });

  it("2タブは HEAT→FINAL", () => {
    expect(inferAutoNextRoundTransition({ finishedRound: "HEAT", tabCount: 2 })).toEqual({
      fromRound: "HEAT",
      toRound: "FINAL",
    });
  });

  it("1タブは遷移なし", () => {
    expect(inferAutoNextRoundTransition({ finishedRound: "HEAT", tabCount: 1 })).toBeNull();
  });

  it("SEMI→FINAL", () => {
    expect(inferAutoNextRoundTransition({ finishedRound: "SEMI", tabCount: 3 })).toEqual({
      fromRound: "SEMI",
      toRound: "FINAL",
    });
  });
});

describe("resolveStartListTabCountForProgression", () => {
  it("startListRoundCount を優先", () => {
    expect(resolveStartListTabCountForProgression(3, undefined)).toBe(3);
  });
});

describe("mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas", () => {
  it("既存の次ラ RESULT_BASED ブロックを上書きする", () => {
    const prevRounds = [
      {
        round: "HEAT" as const,
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "BASELINE" as const,
        heats: [{ heatIndex: 1, participants: [] }],
      },
      {
        round: "SEMI" as const,
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "RESULT_BASED" as const,
        sourceOfficialFingerprint: "old",
        heats: [{ heatIndex: 1, participants: [] }],
      },
    ];
    const nextRoundData = {
      round: "SEMI" as const,
      generatedAt: "2026-01-02T00:00:00.000Z",
      generatedBy: "RESULT_BASED" as const,
      sourceOfficialFingerprint: "new",
      heats: [{ heatIndex: 1, participants: [] }, { heatIndex: 2, participants: [] }],
    };
    const merged = mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas({
      prevRounds,
      nextRoundData,
      fromRound: "HEAT",
      advanceQuotasByOfficialHeat: [{ heat: 1, quota: 4, actual: 4 }],
    });
    const semiBlocks = merged.filter((r) => r.round === "SEMI");
    expect(semiBlocks).toHaveLength(1);
    expect(semiBlocks[0].sourceOfficialFingerprint).toBe("new");
    expect(semiBlocks[0].heats).toHaveLength(2);
  });
});

describe("evaluateNextRoundSlStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompetitionFindUnique.mockResolvedValue({
      startListSettings: {},
      events: [{ startListRoundCount: 3 }],
    });
    mockOfficialResultFindUnique.mockImplementation(
      ({ where }: { where: { competitionId_eventId_round: { round: string } } }) => {
        const round = where.competitionId_eventId_round.round;
        if (round === "HEAT") return Promise.resolve({ id: "or-heat" });
        if (round === "SEMI") {
          return Promise.resolve({
            lockedAt: null,
            heatConfirmations: [],
            rows: [],
          });
        }
        return Promise.resolve(null);
      }
    );
    mockOfficialResultHeatConfirmedFindMany.mockResolvedValue([{ heat: 1 }, { heat: 2 }]);
    mockLoadSnapshot.mockResolvedValue({ events: [] });
    mockComputeFingerprint.mockResolvedValue("fp-current");
    mockIsMarshalStarted.mockResolvedValue(false);
    mockGetRoundData.mockImplementation((_snap, _ev, round) => {
      if (round === "HEAT") return heatRoundData;
      return undefined;
    });
  });

  it("次ラ未生成かつ全ヒート確定なら canGenerate", async () => {
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      canGenerate: true,
      canRegenerate: false,
      canRescueRegenerate: false,
      toRound: "SEMI",
    });
  });

  it("fingerprint 不一致かつマーシャル未開始なら canRegenerate", async () => {
    mockGetRoundData.mockImplementation((_snap, _ev, round) => {
      if (round === "HEAT") return heatRoundData;
      if (round === "SEMI") {
        return {
          round: "SEMI",
          generatedBy: "RESULT_BASED",
          sourceOfficialFingerprint: "fp-old",
          heats: [{ heatIndex: 1, participants: [] }],
        };
      }
      return undefined;
    });
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      canGenerate: false,
      canRegenerate: true,
      canRescueRegenerate: false,
      fingerprintMatches: false,
    });
  });

  it("fingerprint 不一致かつマーシャル開始済みなら canRescueRegenerate", async () => {
    mockGetRoundData.mockImplementation((_snap, _ev, round) => {
      if (round === "HEAT") return heatRoundData;
      if (round === "SEMI") {
        return {
          round: "SEMI",
          generatedBy: "RESULT_BASED",
          sourceOfficialFingerprint: "fp-old",
          heats: [{ heatIndex: 1, participants: [] }],
        };
      }
      return undefined;
    });
    mockIsMarshalStarted.mockResolvedValue(true);
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      canRegenerate: false,
      canRescueRegenerate: true,
    });
  });

  it("全ヒート未確定なら blockedReason", async () => {
    mockOfficialResultHeatConfirmedFindMany.mockResolvedValue([{ heat: 1 }]);
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      canGenerate: false,
      blockedReason: "前ラウンドの全ヒートがリザルト確定するまで SL を生成できません",
    });
  });

  it("次ラにヒート確定済みなら SL 操作不可", async () => {
    mockOfficialResultFindUnique.mockImplementation(
      ({ where }: { where: { competitionId_eventId_round: { round: string } } }) => {
        const round = where.competitionId_eventId_round.round;
        if (round === "HEAT") return Promise.resolve({ id: "or-heat" });
        if (round === "SEMI") {
          return Promise.resolve({
            lockedAt: null,
            heatConfirmations: [{ id: "hc1" }],
            rows: [],
          });
        }
        return Promise.resolve(null);
      }
    );
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      toRoundHasBlockingOfficialResults: true,
      canGenerate: false,
      canRegenerate: false,
      canRescueRegenerate: false,
      blockedReason:
        "次ラウンドでリザルト入力または確定済みのヒートがあるため、SL を生成・再生成できません",
    });
  });

  it("次ラに公式結果行のみあっても SL 操作不可", async () => {
    mockOfficialResultFindUnique.mockImplementation(
      ({ where }: { where: { competitionId_eventId_round: { round: string } } }) => {
        const round = where.competitionId_eventId_round.round;
        if (round === "HEAT") return Promise.resolve({ id: "or-heat" });
        if (round === "SEMI") {
          return Promise.resolve({
            lockedAt: null,
            heatConfirmations: [],
            rows: [{ id: "row1" }],
          });
        }
        return Promise.resolve(null);
      }
    );
    mockGetRoundData.mockImplementation((_snap, _ev, round) => {
      if (round === "HEAT") return heatRoundData;
      if (round === "SEMI") {
        return {
          round: "SEMI",
          generatedBy: "RESULT_BASED",
          sourceOfficialFingerprint: "fp-old",
          heats: [{ heatIndex: 1, participants: [] }],
        };
      }
      return undefined;
    });
    mockIsMarshalStarted.mockResolvedValue(true);
    const status = await evaluateNextRoundSlStatus({
      competitionId: "c1",
      eventId: "e1",
      fromRound: "HEAT",
    });
    expect(status).toMatchObject({
      toRoundHasBlockingOfficialResults: true,
      canRescueRegenerate: false,
      blockedReason:
        "次ラウンドでリザルト入力または確定済みのヒートがあるため、SL を生成・再生成できません",
    });
  });
});
