import type { PrismaClient } from "@prisma/client";
import {
  type OfficialApplicationCompetitionForSubmit,
  resolveOfficialApplicationPositionName,
} from "@/lib/officialApplicationSubmit";

const TO_POSITION = /^テクニカルオフィシャル（([^）]+)）$/;

export function extractTechnicalOfficialClubDisplayNameFromPosition(positionName: string): string | null {
  const m = positionName.match(TO_POSITION);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

export async function loadCompetitionForTechnicalOfficialApplicationResolve(
  prisma: PrismaClient,
  competitionId: string
): Promise<OfficialApplicationCompetitionForSubmit | null> {
  const c = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      status: true,
      entryStartDate: true,
      entryEndDate: true,
      officialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    status: c.status,
    entryStartDate: c.entryStartDate,
    entryEndDate: c.entryEndDate,
    officialRecruitmentEnabled: c.officialRecruitmentEnabled,
    officialQualificationFilterEnabled: c.officialQualificationFilterEnabled,
    technicalOfficialRecruitmentEnabled: c.technicalOfficialRecruitmentEnabled ?? true,
    organization: { admins: [] },
  };
}

/**
 * 承認済み TO 応募の positionName と応募者から、割当クラブ ID を一意に解決する。
 * バックフィル・クラブ UI・アラートで共有（resolveOfficialApplicationPositionName と同じゲート）。
 */
export async function resolveClubIdForTechnicalOfficialApplication(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    userId: string;
    positionName: string;
    competition: OfficialApplicationCompetitionForSubmit;
  }
): Promise<string | null> {
  const displayName = extractTechnicalOfficialClubDisplayNameFromPosition(params.positionName);
  if (!displayName) return null;

  const clubs = await prisma.club.findMany({
    where: { name: displayName },
    select: { id: true },
  });
  if (clubs.length === 0) return null;

  const eligible: string[] = [];
  for (const { id } of clubs) {
    const pos = await resolveOfficialApplicationPositionName(
      prisma,
      params.competitionId,
      params.competition,
      "TECHNICAL",
      id,
      params.userId
    );
    if (pos.ok) eligible.push(id);
  }

  if (eligible.length !== 1) return null;
  return eligible[0]!;
}

/**
 * クラブ名が position と一致する承認済み TO 応募から、当該 clubId に紐づく大会 ID を集める。
 * クラブ詳細ページの `candidateCompetitionIds` にマージする用途。
 */
export async function competitionIdsForClubFromApprovedTechnicalOfficialApplications(
  prisma: PrismaClient,
  clubId: string,
  clubName: string
): Promise<string[]> {
  const trimmed = clubName.trim();
  if (!trimmed) return [];

  const apps = await prisma.competitionOfficialApplication.findMany({
    where: {
      status: "APPROVED",
      positionName: { startsWith: `テクニカルオフィシャル（${trimmed}` },
    },
    select: { competitionId: true, userId: true, positionName: true },
  });

  const competitionCache = new Map<string, OfficialApplicationCompetitionForSubmit | null>();
  const out = new Set<string>();

  for (const app of apps) {
    const dn = extractTechnicalOfficialClubDisplayNameFromPosition(app.positionName);
    if (dn !== trimmed) continue;

    let comp = competitionCache.get(app.competitionId);
    if (comp === undefined) {
      comp = await loadCompetitionForTechnicalOfficialApplicationResolve(prisma, app.competitionId);
      competitionCache.set(app.competitionId, comp);
    }
    if (!comp?.technicalOfficialRecruitmentEnabled) continue;

    const resolved = await resolveClubIdForTechnicalOfficialApplication(prisma, {
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
      competition: comp,
    });
    if (resolved === clubId) out.add(app.competitionId);
  }

  return [...out];
}

/**
 * 複数クラブ管理者向け: 各クラブごとに、TO 公式応募から大会 ID を `competitionsByClub` 用に収集する。
 */
export async function mergeApprovedTechnicalOfficialApplicationCompetitionIdsIntoMap(
  prisma: PrismaClient,
  competitionsByClub: Map<string, Set<string>>,
  clubIdsAndNames: { clubId: string; clubName: string }[]
): Promise<void> {
  const trimmedNames = clubIdsAndNames.map((c) => ({
    clubId: c.clubId,
    clubName: c.clubName.trim(),
  }));
  const allowedNames = new Set(trimmedNames.map((c) => c.clubName).filter(Boolean));
  if (allowedNames.size === 0) return;

  const apps = await prisma.competitionOfficialApplication.findMany({
    where: {
      status: "APPROVED",
      positionName: { startsWith: "テクニカルオフィシャル（" },
    },
    select: { competitionId: true, userId: true, positionName: true },
  });

  const competitionCache = new Map<string, OfficialApplicationCompetitionForSubmit | null>();

  for (const app of apps) {
    const dn = extractTechnicalOfficialClubDisplayNameFromPosition(app.positionName);
    if (!dn || !allowedNames.has(dn)) continue;

    let comp = competitionCache.get(app.competitionId);
    if (comp === undefined) {
      comp = await loadCompetitionForTechnicalOfficialApplicationResolve(prisma, app.competitionId);
      competitionCache.set(app.competitionId, comp);
    }
    if (!comp?.technicalOfficialRecruitmentEnabled) continue;

    const resolved = await resolveClubIdForTechnicalOfficialApplication(prisma, {
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
      competition: comp,
    });
    if (!resolved) continue;
    competitionsByClub.get(resolved)?.add(app.competitionId);
  }
}
