import { describe, expect, it, vi } from "vitest";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  canApplyRunUp,
  eliminationSlots,
  isHeatResultReadyForConfirm,
  listCalledSlotsMissingOkResultRow,
  validateHeatResultConfirmInTransaction,
} from "@/lib/heatResultEliminationRunUp";
import * as marshalHeatCalledCount from "@/lib/marshalHeatCalledCount";

function minimalSnapshot(eventId: string, entryId: string, heatIndex: number): StartListSnapshotPayload {
  return {
    version: 1,
    capturedAt: "2020-01-01T00:00:00.000Z",
    events: [
      {
        eventId,
        name: "Test",
        sex: "MALE",
        type: "INDIVIDUAL",
        rounds: [
          {
            round: "HEAT",
            generatedAt: "2020-01-01T00:00:00.000Z",
            generatedBy: "ENTRY_CLOSE",
            heats: [
              {
                heatIndex,
                participants: [
                  {
                    kind: "INDIVIDUAL" as const,
                    entryId,
                    userId: "u1",
                    name: "T T",
                    clubId: null,
                    clubName: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("eliminationSlots", () => {
  it("8人中4アップなら脱落4・ランアップ4", () => {
    expect(eliminationSlots({ called: 8, quota: 4 })).toEqual({
      eliminationTarget: 4,
      runUpTarget: 4,
    });
  });
});

describe("canApplyRunUp", () => {
  it("脱落4済み・ランアップ0なら適用可", () => {
    expect(
      canApplyRunUp({
        called: 8,
        quota: 4,
        rankedCount: 4,
        runUpCount: 0,
        resultDraftCount: 0,
      })
    ).toBe(true);
  });

  it("脱落不足なら不可", () => {
    expect(
      canApplyRunUp({
        called: 8,
        quota: 4,
        rankedCount: 3,
        runUpCount: 0,
        resultDraftCount: 0,
      })
    ).toBe(false);
  });
});

describe("isHeatResultReadyForConfirm", () => {
  it("脱落式: 脱落4+ランアップ4で完了", () => {
    expect(
      isHeatResultReadyForConfirm({
        called: 8,
        quota: 4,
        rankedCount: 4,
        runUpCount: 4,
        resultDraftCount: 0,
        usesElimination: true,
      })
    ).toBe(true);
  });

  it("通常: 全員着順で完了", () => {
    expect(
      isHeatResultReadyForConfirm({
        called: 5,
        quota: 2,
        rankedCount: 5,
        runUpCount: 0,
        resultDraftCount: 0,
        usesElimination: false,
      })
    ).toBe(true);
  });
});

describe("validateHeatResultConfirmInTransaction", () => {
  it("脱落型 OK", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({
        rank: 8 - i,
        advanceWithoutRank: false,
      })),
      ...Array.from({ length: 4 }, () => ({
        rank: null as number | null,
        advanceWithoutRank: true,
      })),
    ];
    expect(
      validateHeatResultConfirmInTransaction({
        calledInHeat: 8,
        quota: 4,
        rows,
      })
    ).toEqual({ ok: true });
  });

  it("ランアップ不足 NG", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({
        rank: 8 - i,
        advanceWithoutRank: false,
      })),
    ];
    expect(
      validateHeatResultConfirmInTransaction({
        calledInHeat: 8,
        quota: 4,
        rows,
      })
    ).toEqual({ ok: false, code: "HEAT_RESULT_INCOMPLETE_RUN_UP" });
  });
});

describe("listCalledSlotsMissingOkResultRow", () => {
  it("statusRows 指定時は fetchParticipantStatusesForMarshalEvent を呼ばない", async () => {
    const fetchSpy = vi.spyOn(marshalHeatCalledCount, "fetchParticipantStatusesForMarshalEvent");
    const findMarshal = vi.fn();
    const tx = {
      officialResultRow: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      competitionHeatMarshalState: {
        findUnique: findMarshal,
      },
    };

    await listCalledSlotsMissingOkResultRow({
      tx: tx as never,
      competitionId: "c1",
      eventId: "e1",
      round: "HEAT",
      heatIndex: 1,
      officialResultId: "or1",
      snapshot: minimalSnapshot("e1", "entry1", 1),
      statusRows: [],
      heatMarshalCallClosed: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(findMarshal).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
