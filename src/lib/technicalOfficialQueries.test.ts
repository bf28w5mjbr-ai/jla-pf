import { describe, expect, it, vi } from "vitest";
import {
  countValidTechnicalOfficialAssignments,
  countValidTechnicalOfficialAssignmentsDetailed,
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
    const appFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      competition: { findUnique },
      competitionEntry: { count },
      competitionTechnicalOfficialAssignment: { findMany },
      competitionOfficialApplication: { findMany: appFindMany },
    } as never;
    const st = await getTechnicalOfficialStatusForClub(prisma, "c", "club");
    expect(st).not.toBeNull();
    expect(st!.configured).toBe(false);
    expect(st!.entryCount).toBe(2);
    expect(st!.required).toBe(0);
  });
});

describe("countValidTechnicalOfficialAssignments", () => {
  it("counts approved TO applications when assignment is missing", async () => {
    const assignmentFindMany = vi.fn().mockResolvedValue([]);
    const appFindMany = vi.fn().mockResolvedValue([
      {
        userId: "u1",
        positionName: "テクニカルオフィシャル（西浜）",
        user: {
          qualifications: [
            { kind: "BLS", status: "APPROVED", expiryDate: null },
            { kind: "RefereeC", status: "APPROVED", expiryDate: null },
          ],
        },
      },
    ]);
    const competitionFindUnique = vi.fn().mockResolvedValue({
      id: "comp",
      status: "OPEN",
      entryStartDate: null,
      entryEndDate: null,
      officialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
    });
    const clubFindMany = vi.fn().mockResolvedValue([{ id: "club-west" }]);
    const clubFindUnique = vi.fn().mockResolvedValue({ id: "club-west", name: "西浜" });
    const membershipFindFirst = vi.fn().mockResolvedValue({ id: "m1" });

    const prisma = {
      competitionTechnicalOfficialAssignment: { findMany: assignmentFindMany },
      competitionOfficialApplication: { findMany: appFindMany },
      competition: { findUnique: competitionFindUnique },
      club: { findMany: clubFindMany, findUnique: clubFindUnique },
      membership: { findFirst: membershipFindFirst },
      teamEntry: { findFirst: vi.fn().mockResolvedValue(null) },
      competitionEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never;

    const n = await countValidTechnicalOfficialAssignments(prisma, "comp", "club-west", true);
    expect(n).toBe(1);
  });

  it("provides diagnostics and de-duplicates by userId", async () => {
    const assignmentFindMany = vi.fn().mockResolvedValue([
      {
        userId: "u1",
        user: { qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }] },
      },
    ]);
    const appFindMany = vi.fn().mockResolvedValue([
      {
        userId: "u1",
        positionName: "テクニカルオフィシャル（西浜）",
        user: { qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }] },
      },
      {
        userId: "u2",
        positionName: "テクニカルオフィシャル（西浜）",
        user: { qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }] },
      },
    ]);
    const competitionFindUnique = vi.fn().mockResolvedValue({
      id: "comp",
      status: "OPEN",
      entryStartDate: null,
      entryEndDate: null,
      officialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: false,
      technicalOfficialRecruitmentEnabled: true,
    });
    const clubFindMany = vi.fn().mockImplementation(({ where }: { where?: { name?: string } }) => {
      if (where?.name === "西浜") return [{ id: "club-west", name: "西浜" }];
      return [];
    });
    const clubFindUnique = vi.fn().mockResolvedValue({ id: "club-west", name: "西浜" });
    const prisma = {
      competitionTechnicalOfficialAssignment: { findMany: assignmentFindMany },
      competitionOfficialApplication: { findMany: appFindMany },
      competition: { findUnique: competitionFindUnique },
      club: { findMany: clubFindMany, findUnique: clubFindUnique },
      membership: { findFirst: vi.fn().mockResolvedValue({ id: "m1" }) },
      teamEntry: { findFirst: vi.fn().mockResolvedValue({ id: "te1" }) },
      competitionEntry: { findFirst: vi.fn().mockResolvedValue({ id: "ce1" }) },
    } as never;

    const detail = await countValidTechnicalOfficialAssignmentsDetailed(prisma, "comp", "club-west", false);
    expect(detail.assigned).toBe(2);
    expect(detail.diagnostics.assignmentCount).toBe(1);
    expect(detail.diagnostics.fallbackApprovedCount).toBe(1);
    expect(detail.diagnostics.duplicateUserSkippedCount).toBe(1);
  });
});
