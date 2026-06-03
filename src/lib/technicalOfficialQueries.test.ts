import { describe, expect, it, vi } from "vitest";
import {
  countValidTechnicalOfficialAssignments,
  countValidTechnicalOfficialAssignmentsDetailed,
  countClubIndividualEntryRows,
  getTechnicalOfficialStatusForClub,
  listClubAdminTechnicalOfficialAlerts,
  listTechnicalOfficialShortagesForCompetition,
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
    const prisma = {
      competition: { findUnique },
      club: { findUnique: vi.fn().mockResolvedValue({ name: "x" }), count: vi.fn().mockResolvedValue(1) },
    } as never;
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
      club: {
        findUnique: vi.fn().mockResolvedValue({ name: "x" }),
        count: vi.fn().mockResolvedValue(1),
      },
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
          profile: { familyName: "山田", givenName: "一郎" },
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
        user: {
          profile: { familyName: "山田", givenName: "一郎" },
          qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }],
        },
      },
    ]);
    const appFindMany = vi.fn().mockResolvedValue([
      {
        userId: "u1",
        positionName: "テクニカルオフィシャル（西浜）",
        user: {
          profile: { familyName: "山田", givenName: "一郎" },
          qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }],
        },
      },
      {
        userId: "u2",
        positionName: "テクニカルオフィシャル（西浜）",
        user: {
          profile: { familyName: "佐藤", givenName: "二郎" },
          qualifications: [{ kind: "BLS", status: "APPROVED", expiryDate: null }],
        },
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
    expect(detail.fulfillers).toEqual([
      { userId: "u1", familyName: "山田", givenName: "一郎" },
      { userId: "u2", familyName: "佐藤", givenName: "二郎" },
    ]);
  });
});

describe("listClubAdminTechnicalOfficialAlerts", () => {
  it("evaluates assignment counts for multiple pairs concurrently within a chunk", async () => {
    let inFlight = 0;
    let peakInFlight = 0;

    const assignmentCountFindMany = vi.fn(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return [];
    });
    const assignmentPairsFindMany = vi.fn().mockResolvedValue([
      { clubId: "club-1", competitionId: "comp-a" },
      { clubId: "club-1", competitionId: "comp-b" },
    ]);

    const tiers = [{ minEntries: 1, requiredCount: 2 }];
    const competitionRows = [
      {
        id: "comp-a",
        name: "大会A",
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        officialQualificationFilterEnabled: false,
        technicalOfficialTiers: tiers,
      },
      {
        id: "comp-b",
        name: "大会B",
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        officialQualificationFilterEnabled: false,
        technicalOfficialTiers: tiers,
      },
    ];

    const prisma = {
      membership: {
        findMany: vi.fn().mockResolvedValue([{ clubId: "club-1", club: { name: "西浜" } }]),
        findFirst: vi.fn().mockResolvedValue({ id: "m1" }),
      },
      competitionEntry: {
        findMany: vi.fn().mockResolvedValue([
          { clubId: "club-1", competitionId: "comp-a" },
          { clubId: "club-1", competitionId: "comp-b" },
        ]),
        groupBy: vi.fn().mockResolvedValue([
          { competitionId: "comp-a", clubId: "club-1", _count: { _all: 3 } },
          { competitionId: "comp-b", clubId: "club-1", _count: { _all: 3 } },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      teamEntry: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      competitionTechnicalOfficialAssignment: {
        findMany: vi.fn((args: { distinct?: unknown }) =>
          args?.distinct != null ? assignmentPairsFindMany(args) : assignmentCountFindMany(args)
        ),
      },
      competitionTechnicalOfficialInvitation: { findMany: vi.fn().mockResolvedValue([]) },
      competitionOfficialApplication: { findMany: vi.fn().mockResolvedValue([]) },
      competition: {
        findMany: vi.fn().mockResolvedValue(competitionRows),
        findUnique: vi.fn().mockResolvedValue({
          id: "comp-a",
          status: "OPEN",
          entryStartDate: null,
          entryEndDate: null,
          officialRecruitmentEnabled: true,
          officialQualificationFilterEnabled: false,
          technicalOfficialRecruitmentEnabled: true,
        }),
      },
      club: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ id: "club-1", name: "西浜" }),
      },
    } as never;

    const alerts = await listClubAdminTechnicalOfficialAlerts(prisma, "user-1");

    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.competitionId).sort()).toEqual(["comp-a", "comp-b"]);
    expect(assignmentCountFindMany).toHaveBeenCalledTimes(2);
    expect(peakInFlight).toBeGreaterThan(1);
  });
});

describe("listTechnicalOfficialShortagesForCompetition", () => {
  it("returns [] when official recruitment is disabled", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      officialRecruitmentEnabled: false,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: false,
      technicalOfficialTiers: [{ minEntries: 1, requiredCount: 1 }],
    });
    const prisma = { competition: { findUnique } } as never;
    const rows = await listTechnicalOfficialShortagesForCompetition(prisma, "comp-1");
    expect(rows).toEqual([]);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "comp-1" },
      select: {
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        officialQualificationFilterEnabled: true,
        technicalOfficialTiers: true,
      },
    });
  });
});
