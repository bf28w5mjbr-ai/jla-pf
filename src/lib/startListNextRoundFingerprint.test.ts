import { describe, expect, it } from "vitest";
import {
  fingerprintFromPrevRoundOfficialData,
  findResultBasedRoundBlock,
  storedFingerprintForNextRoundBlock,
} from "@/lib/startListNextRoundFingerprint";
import type { StartListRoundData } from "@/lib/startListRounds";

const baseRows = [
  {
    heat: 1,
    rank: 1,
    advanceWithoutRank: false,
    entryType: "INDIVIDUAL",
    competitionEntryId: "e1",
    teamEntryId: null,
  },
  {
    heat: 1,
    rank: 2,
    advanceWithoutRank: false,
    entryType: "INDIVIDUAL",
    competitionEntryId: "e2",
    teamEntryId: null,
  },
];

describe("fingerprintFromPrevRoundOfficialData", () => {
  it("同一データなら同じ fingerprint", () => {
    const a = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1, 2],
      rows: baseRows,
    });
    const b = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [2, 1],
      rows: [...baseRows].reverse(),
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("確定ヒート集合が変わると fingerprint が変わる", () => {
    const before = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1],
      rows: baseRows,
    });
    const after = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1, 2],
      rows: baseRows,
    });
    expect(before).not.toBe(after);
  });

  it("行の rank が変わると fingerprint が変わる", () => {
    const before = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1],
      rows: baseRows,
    });
    const after = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1],
      rows: baseRows.map((r) => (r.competitionEntryId === "e2" ? { ...r, rank: 3 } : r)),
    });
    expect(before).not.toBe(after);
  });

  it("advanceWithoutRank が変わると fingerprint が変わる", () => {
    const before = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1],
      rows: baseRows,
    });
    const after = fingerprintFromPrevRoundOfficialData({
      confirmedHeats: [1],
      rows: [{ ...baseRows[0], advanceWithoutRank: true }, baseRows[1]],
    });
    expect(before).not.toBe(after);
  });
});

describe("storedFingerprintForNextRoundBlock", () => {
  it("sourceOfficialFingerprint を返す", () => {
    const block: StartListRoundData = {
      round: "SEMI",
      generatedAt: "2026-01-01T00:00:00.000Z",
      generatedBy: "RESULT_BASED",
      sourceRound: "HEAT",
      sourceOfficialFingerprint: "abc123",
      heats: [],
    };
    expect(storedFingerprintForNextRoundBlock(block)).toBe("abc123");
  });

  it("未設定なら null", () => {
    expect(storedFingerprintForNextRoundBlock(undefined)).toBeNull();
    expect(
      storedFingerprintForNextRoundBlock({
        round: "SEMI",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "RESULT_BASED",
        heats: [],
      })
    ).toBeNull();
  });
});

describe("findResultBasedRoundBlock", () => {
  it("RESULT_BASED のみ返す", () => {
    const rounds: StartListRoundData[] = [
      {
        round: "SEMI",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "BASELINE",
        heats: [{ heatIndex: 1, participants: [] }],
      },
      {
        round: "SEMI",
        generatedAt: "2026-01-02T00:00:00.000Z",
        generatedBy: "RESULT_BASED",
        heats: [{ heatIndex: 1, participants: [] }],
      },
    ];
    expect(findResultBasedRoundBlock(rounds, "SEMI")?.generatedBy).toBe("RESULT_BASED");
  });
});
