import type { PrismaClient } from "@prisma/client";
import { mergeApprovedTechnicalOfficialApplicationCompetitionIdsIntoMap } from "@/lib/resolveTechnicalOfficialApplicationClub";
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

  if (adminMemberships.length === 0) return [];

  const clubIds = adminMemberships.map((m) => m.clubId);
  const clubNameById = new Map(adminMemberships.map((m) => [m.clubId, m.club.name]));

  const [allInd, allTeam] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: { clubId: { in: clubIds }, status: { not: "CANCELLED" } },
      select: { clubId: true, competitionId: true },
      distinct: ["clubId", "competitionId"],
    }),
    prisma.teamEntry.findMany({
      where: { clubId: { in: clubIds } },
      select: { clubId: true, competitionId: true },
      distinct: ["clubId", "competitionId"],
    }),
  ]);

  const competitionsByClub = new Map<string, Set<string>>();
  for (const m of adminMemberships) {
    competitionsByClub.set(m.clubId, new Set());
  }
  for (const r of allInd) {
    if (!r.clubId) continue;
    competitionsByClub.get(r.clubId)?.add(r.competitionId);
  }
  for (const r of allTeam) {
    competitionsByClub.get(r.clubId)?.add(r.competitionId);
  }

  const [toAssignClubPairs, toInvClubPairs] = await Promise.all([
    prisma.competitionTechnicalOfficialAssignment.findMany({
      where: { clubId: { in: clubIds } },
      select: { clubId: true, competitionId: true },
      distinct: ["clubId", "competitionId"],
    }),
    prisma.competitionTechnicalOfficialInvitation.findMany({
      where: { clubId: { in: clubIds }, status: "PENDING" },
      select: { clubId: true, competitionId: true },
      distinct: ["clubId", "competitionId"],
    }),
  ]);
  for (const r of toAssignClubPairs) {
    competitionsByClub.get(r.clubId)?.add(r.competitionId);
  }
  for (const r of toInvClubPairs) {
    competitionsByClub.get(r.clubId)?.add(r.competitionId);
  }

  await mergeApprovedTechnicalOfficialApplicationCompetitionIdsIntoMap(
    prisma,
    competitionsByClub,
    adminMemberships.map((m) => ({ clubId: m.clubId, clubName: m.club.name }))
  );

  const allCompetitionIds = new Set<string>();
  for (const set of competitionsByClub.values()) {
    for (const cid of set) allCompetitionIds.add(cid);
  }
  if (allCompetitionIds.size === 0) return [];

  const competitions = await prisma.competition.findMany({
    where: { id: { in: [...allCompetitionIds] } },
    select: {
      id: true,
      name: true,
      officialRecruitmentEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialTiers: true,
    },
  });
  const compById = new Map(competitions.map((c) => [c.id, c]));

  type Pair = { competitionId: string; clubId: string };
  const pairKey = (p: Pair) => `${p.competitionId}:${p.clubId}`;
  const pairs: Pair[] = [];
  const seenPairs = new Set<string>();

  for (const m of adminMemberships) {
    for (const competitionId of competitionsByClub.get(m.clubId) ?? []) {
      const comp = compById.get(competitionId);
      if (!comp?.officialRecruitmentEnabled || !comp.technicalOfficialRecruitmentEnabled) continue;
      const tiers = parseTechnicalOfficialTiers(comp.technicalOfficialTiers);
      if (tiers.length === 0) continue;
      const pk = pairKey({ competitionId, clubId: m.clubId });
      if (seenPairs.has(pk)) continue;
      seenPairs.add(pk);
      pairs.push({ competitionId, clubId: m.clubId });
    }
  }

  if (pairs.length === 0) return [];

  const PAIR_CHUNK = 50;
  const pairChunks: Pair[][] = [];
  for (let i = 0; i < pairs.length; i += PAIR_CHUNK) {
    pairChunks.push(pairs.slice(i, i + PAIR_CHUNK));
  }

  const [entryGroupParts, assignmentParts] = await Promise.all([
    Promise.all(
      pairChunks.map((part) =>
        prisma.competitionEntry.groupBy({
          by: ["competitionId", "clubId"],
          where: {
            status: { not: "CANCELLED" },
            clubId: { not: null },
            OR: part.map((p) => ({ competitionId: p.competitionId, clubId: p.clubId })),
          },
          _count: { _all: true },
        })
      )
    ),
    Promise.all(
      pairChunks.map((part) =>
        prisma.competitionTechnicalOfficialAssignment.findMany({
          where: { OR: part.map((p) => ({ competitionId: p.competitionId, clubId: p.clubId })) },
          select: {
            competitionId: true,
            clubId: true,
            user: {
              select: {
                qualifications: {
                  select: { kind: true, status: true, expiryDate: true },
                },
              },
            },
          },
        })
      )
    ),
  ]);

  const entryGroups = entryGroupParts.flat();
  const assignments = assignmentParts.flat();

  const entryCountByPair = new Map<string, number>();
  for (const g of entryGroups) {
    if (g.clubId === null) continue;
    entryCountByPair.set(pairKey({ competitionId: g.competitionId, clubId: g.clubId }), g._count._all);
  }

  type AssignmentRow = (typeof assignments)[number];
  const assignmentsByPair = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    const k = pairKey({ competitionId: a.competitionId, clubId: a.clubId });
    let bucket = assignmentsByPair.get(k);
    if (!bucket) {
      bucket = [];
      assignmentsByPair.set(k, bucket);
    }
    bucket.push(a);
  }

  const alerts: ClubAdminTechnicalOfficialAlert[] = [];

  for (const p of pairs) {
    const comp = compById.get(p.competitionId);
    if (!comp) continue;
    const tiers = parseTechnicalOfficialTiers(comp.technicalOfficialTiers);
    if (tiers.length === 0) continue;

    const k = pairKey(p);
    const entryCount = entryCountByPair.get(k) ?? 0;
    const required = requiredTechnicalOfficialCount(entryCount, tiers);
    if (required <= 0) continue;

    const requireQualificationFilter = Boolean(comp.officialQualificationFilterEnabled);
    const assignRows = assignmentsByPair.get(k) ?? [];
    let assigned = 0;
    for (const a of assignRows) {
      const ok = requireQualificationFilter
        ? hasRequiredOfficialQualifications(
            a.user.qualifications.map((q) => ({
              kind: q.kind,
              status: q.status,
              expiryDate: q.expiryDate,
            }))
          )
        : true;
      if (ok) assigned += 1;
    }

    const shortage = Math.max(0, required - assigned);
    if (shortage <= 0) continue;

    alerts.push({
      clubId: p.clubId,
      clubName: clubNameById.get(p.clubId) ?? p.clubId,
      competitionId: p.competitionId,
      competitionName: comp.name,
      shortage,
      required,
      assigned,
    });
  }

  return alerts.sort((a, b) => a.competitionName.localeCompare(b.competitionName, "ja"));
}
