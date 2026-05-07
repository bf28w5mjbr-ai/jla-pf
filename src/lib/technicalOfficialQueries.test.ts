import { describe, expect, it, vi } from "vitest";
import {
  countClubIndividualEntryRows,
  getTechnicalOfficialStatusForClub,
} from "@/lib/technicalOfficialQueries";

describe("countClubIndividualEntryRows", () => {
  it("counts CompetitionEntry rows for club and competition excluding CANCELLED", async () => {
    const count = vi.fn().mockResolvedValue(4);
    const prisma = { competitionEntry: { count } } as never;
    const n = await countClubIndividualEntryRows(prisma, "comp-1", "club-1");
    expect(n).toBe(4);
    expect(count).toHaveBeenCalledWith({
      where: {
        competitionId: "comp-1",
        clubId: "club-1",
        status: { not: "CANCELLED" },
      },
    });
  });
});

describe("getTechnicalOfficialStatusForClub", () => {
  it("returns null when official recruitment is disabled", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      officialRecruitmentEnabled: false,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: false,
      technicalOfficialTiers: [{ minEntries: 1, requiredCount: 1 }],
    });
    const prisma = { competition: { findUnique } } as never;
    const st = await getTechnicalOfficialStatusForClub(prisma, "c", "club");
    expect(st).toBeNull();
  });

  it("returns configured false when tiers are empty", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      officialRecruitmentEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: false,
      technicalOfficialTiers: [],
    });
    const count = vi.fn().mockResolvedValue(2);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      competition: { findUnique },
      competitionEntry: { count },
      competitionTechnicalOfficialAssignment: { findMany },
    } as never;
    const st = await getTechnicalOfficialStatusForClub(prisma, "c", "club");
    expect(st).not.toBeNull();
    expect(st!.configured).toBe(false);
    expect(st!.entryCount).toBe(2);
    expect(st!.required).toBe(0);
  });
});
