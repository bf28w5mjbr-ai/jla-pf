import type { PrismaClient } from "@prisma/client";
import {
  hasRequiredOfficialQualifications,
  parseTechnicalOfficialTiers,
  requiredTechnicalOfficialCount,
} from "@/lib/technicalOfficialRules";

/**
 * テクニカルオフィシャル所要人数の閾値に用いる件数。
 * クラブ所属としての個人エントリー（`CompetitionEntry`、キャンセル除く）のみ。
 * チーム種目の `TeamEntry` 件数は含めない（構成員は個人エントリーでカウントする前提）。
 */
export async function countClubIndividualEntryRows(
  prisma: PrismaClient,
  competitionId: string,
  clubId: string
): Promise<number> {
  return prisma.competitionEntry.count({
    where: {
      competitionId,
      clubId,
      status: { not: "CANCELLED" },
    },
  });
}

export async function countValidTechnicalOfficialAssignments(
  prisma: PrismaClient,
  competitionId: string,
  clubId: string,
  requireQualificationFilter: boolean
): Promise<number> {
  const assignments = await prisma.competitionTechnicalOfficialAssignment.findMany({
    where: { competitionId, clubId },
    include: {
      user: {
        select: {
          qualifications: {
            select: { kind: true, status: true, expiryDate: true },
          },
        },
      },
    },
  });

  let n = 0;
  for (const a of assignments) {
    const ok = requireQualificationFilter
      ? hasRequiredOfficialQualifications(
          a.user.qualifications.map((q) => ({
            kind: q.kind,
            status: q.status,
            expiryDate: q.expiryDate,
          }))
        )
      : true;
    if (ok) n += 1;
  }
  return n;
}

export type TechnicalOfficialShortageRow = {
  clubId: string;
  clubName: string;
  /** 当該クラブ・大会の個人エントリー件数（キャンセル除く） */
  entryCount: number;
  required: number;
  assigned: number;
  shortage: number;
};

export async function listTechnicalOfficialShortagesForCompetition(
  prisma: PrismaClient,
  competitionId: string
): Promise<TechnicalOfficialShortageRow[]> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      officialRecruitmentEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialTiers: true,
    },
  });

  if (
    !competition?.officialRecruitmentEnabled ||
    !competition?.technicalOfficialRecruitmentEnabled
  ) {
    return [];
  }

  const tiers = parseTechnicalOfficialTiers(competition.technicalOfficialTiers);
  if (tiers.length === 0) return [];

  const clubIdsFromIndividuals = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      clubId: { not: null },
      status: { not: "CANCELLED" },
    },
    select: { clubId: true },
    distinct: ["clubId"],
  });
  const clubIdsFromTeams = await prisma.teamEntry.findMany({
    where: { competitionId },
    select: { clubId: true },
    distinct: ["clubId"],
  });

  const clubIdSet = new Set<string>();
  for (const r of clubIdsFromIndividuals) {
    if (r.clubId) clubIdSet.add(r.clubId);
  }
  for (const r of clubIdsFromTeams) {
    clubIdSet.add(r.clubId);
  }

  const clubIds = [...clubIdSet];
  if (clubIds.length === 0) return [];

  const clubs = await prisma.club.findMany({
    where: { id: { in: clubIds } },
    select: { id: true, name: true },
  });

  const rows: TechnicalOfficialShortageRow[] = [];
  for (const club of clubs) {
    const entryCount = await countClubIndividualEntryRows(prisma, competitionId, club.id);
    const required = requiredTechnicalOfficialCount(entryCount, tiers);
    if (required <= 0) continue;

    const assigned = await countValidTechnicalOfficialAssignments(
      prisma,
      competitionId,
      club.id,
      Boolean(competition.officialQualificationFilterEnabled)
    );
    const shortage = Math.max(0, required - assigned);
    if (shortage <= 0) continue;

    rows.push({
      clubId: club.id,
      clubName: club.name,
      entryCount,
      required,
      assigned,
      shortage,
    });
  }

  return rows.sort((a, b) => a.clubName.localeCompare(b.clubName, "ja"));
}

export async function getTechnicalOfficialStatusForClub(
  prisma: PrismaClient,
  competitionId: string,
  clubId: string
): Promise<{
  configured: boolean;
  qualificationFilterEnabled: boolean;
  entryCount: number;
  required: number;
  assigned: number;
  shortage: number;
  tiers: ReturnType<typeof parseTechnicalOfficialTiers>;
} | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      officialRecruitmentEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialTiers: true,
    },
  });

  if (
    !competition?.officialRecruitmentEnabled ||
    !competition?.technicalOfficialRecruitmentEnabled
  ) {
    return null;
  }

  const tiers = parseTechnicalOfficialTiers(competition.technicalOfficialTiers);
  const entryCount = await countClubIndividualEntryRows(prisma, competitionId, clubId);
  const required = requiredTechnicalOfficialCount(entryCount, tiers);
  const assigned = await countValidTechnicalOfficialAssignments(
    prisma,
    competitionId,
    clubId,
    Boolean(competition.officialQualificationFilterEnabled)
  );

  return {
    configured: tiers.length > 0,
    qualificationFilterEnabled: Boolean(competition.officialQualificationFilterEnabled),
    entryCount,
    required,
    assigned,
    shortage: Math.max(0, required - assigned),
    tiers,
  };
}

export type ClubAdminTechnicalOfficialAlert = {
  clubId: string;
  clubName: string;
  competitionId: string;
  competitionName: string;
  shortage: number;
  required: number;
  assigned: number;
};

export async function listClubAdminTechnicalOfficialAlerts(
  prisma: PrismaClient,
  userId: string
): Promise<ClubAdminTechnicalOfficialAlert[]> {
  const adminMemberships = await prisma.membership.findMany({
    where: { userId, status: "APPROVED", role: "ADMIN" },
    select: { clubId: true, club: { select: { name: true } } },
  });

  const alerts: ClubAdminTechnicalOfficialAlert[] = [];

  for (const m of adminMemberships) {
    const [indEntries, teamEntries] = await Promise.all([
      prisma.competitionEntry.findMany({
        where: { clubId: m.clubId, status: { not: "CANCELLED" } },
        select: { competitionId: true },
        distinct: ["competitionId"],
      }),
      prisma.teamEntry.findMany({
        where: { clubId: m.clubId },
        select: { competitionId: true },
        distinct: ["competitionId"],
      }),
    ]);
    const cids = new Set<string>();
    for (const r of indEntries) cids.add(r.competitionId);
    for (const r of teamEntries) cids.add(r.competitionId);

    if (cids.size === 0) continue;

    const nameRows = await prisma.competition.findMany({
      where: { id: { in: [...cids] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(nameRows.map((r) => [r.id, r.name]));

    for (const competitionId of cids) {
      const st = await getTechnicalOfficialStatusForClub(prisma, competitionId, m.clubId);
      if (!st?.configured || st.shortage <= 0) continue;

      alerts.push({
        clubId: m.clubId,
        clubName: m.club.name,
        competitionId,
        competitionName: nameById.get(competitionId) ?? competitionId,
        shortage: st.shortage,
        required: st.required,
        assigned: st.assigned,
      });
    }
  }

  return alerts.sort((a, b) => a.competitionName.localeCompare(b.competitionName, "ja"));
}
