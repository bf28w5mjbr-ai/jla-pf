import { describe, expect, it, vi } from "vitest";
import {
  competitionOfficialLockInstant,
  isOfficialResultEffectivelyLocked,
  isPastCompetitionOfficialLockDeadline,
  runAutoLockOfficialResultsPass,
} from "./officialResultAutoLock";

describe("competitionOfficialLockInstant", () => {
  it("endDate の JST 暦日 23:59:59.999 を返す", () => {
    const endDate = new Date("2026-06-02T00:00:00.000Z");
    expect(competitionOfficialLockInstant(endDate).toISOString()).toBe(
      "2026-06-02T14:59:59.999Z"
    );
  });
});

describe("isPastCompetitionOfficialLockDeadline", () => {
  const endDate = new Date("2026-06-02T00:00:00.000Z");

  it("締切前は false", () => {
    expect(
      isPastCompetitionOfficialLockDeadline(endDate, new Date("2026-06-02T14:59:59.000Z"))
    ).toBe(false);
  });

  it("締切直後は true", () => {
    expect(
      isPastCompetitionOfficialLockDeadline(endDate, new Date("2026-06-02T15:00:00.000Z"))
    ).toBe(true);
  });
});

describe("isOfficialResultEffectivelyLocked", () => {
  const endDate = new Date("2026-06-02T00:00:00.000Z");

  it("lockedAt があれば締切前でも true", () => {
    expect(
      isOfficialResultEffectivelyLocked(
        new Date("2026-06-01T00:00:00.000Z"),
        endDate,
        new Date("2026-06-01T12:00:00.000Z")
      )
    ).toBe(true);
  });

  it("lockedAt がなく締切後なら true", () => {
    expect(
      isOfficialResultEffectivelyLocked(null, endDate, new Date("2026-06-03T00:00:00.000Z"))
    ).toBe(true);
  });

  it("lockedAt がなく締切前なら false", () => {
    expect(
      isOfficialResultEffectivelyLocked(null, endDate, new Date("2026-06-01T12:00:00.000Z"))
    ).toBe(false);
  });
});

describe("runAutoLockOfficialResultsPass", () => {
  it("締切を過ぎた大会の未ロック公式結果に lockedAt を設定する", async () => {
    const lockInstant = new Date("2026-06-02T14:59:59.999Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      officialResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "or1",
            competition: { id: "c1", endDate: new Date("2026-06-02T00:00:00.000Z") },
          },
          {
            id: "or2",
            competition: { id: "c1", endDate: new Date("2026-06-02T00:00:00.000Z") },
          },
          {
            id: "or3",
            competition: { id: "c2", endDate: new Date("2026-06-10T00:00:00.000Z") },
          },
        ]),
        updateMany,
      },
    };

    const result = await runAutoLockOfficialResultsPass(
      prisma as never,
      new Date("2026-06-03T00:00:00.000Z")
    );

    expect(result).toEqual({ competitionsScanned: 2, officialResultsLocked: 2 });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["or1", "or2"] }, lockedAt: null },
      data: { lockedAt: lockInstant },
    });
  });

  it("締切前の大会は更新しない", async () => {
    const updateMany = vi.fn();
    const prisma = {
      officialResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "or1",
            competition: { id: "c1", endDate: new Date("2026-06-10T00:00:00.000Z") },
          },
        ]),
        updateMany,
      },
    };

    const result = await runAutoLockOfficialResultsPass(
      prisma as never,
      new Date("2026-06-03T00:00:00.000Z")
    );

    expect(result).toEqual({ competitionsScanned: 1, officialResultsLocked: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
