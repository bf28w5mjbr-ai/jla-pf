import type { PrismaClient } from "@prisma/client";
import {
  type OfficialApplicationCompetitionForSubmit,
  resolveOfficialApplicationPositionName,
} from "@/lib/officialApplicationSubmit";

const TO_POSITION = /^テクニカルオフィシャル[（(]([^)）]+)[)）]$/;

function normalizeClubDisplayName(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTechnicalOfficialClubDisplayNameFromPosition(positionName: string): string | null {
  const m = positionName.match(TO_POSITION);
  const name = normalizeClubDisplayName(m?.[1] ?? "");
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
    organization: { status: "APPROVED", admins: [] },
  };
}

export type ResolveTechnicalOfficialClubDiagnosticReason =
  | "ok"
  | "invalid_position_name"
  | "no_name_match"
  | "not_eligible"
  | "ambiguous_eligible";

export type ResolveTechnicalOfficialClubDiagnostic = {
  clubId: string | null;
  reason: ResolveTechnicalOfficialClubDiagnosticReason;
  displayName: string | null;
  candidateClubIds: string[];
  eligibleClubIds: string[];
};

export async function resolveClubIdForTechnicalOfficialApplicationWithDiagnostic(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    userId: string;
    positionName: string;
    competition: OfficialApplicationCompetitionForSubmit;
  }
): Promise<ResolveTechnicalOfficialClubDiagnostic> {
  const displayName = extractTechnicalOfficialClubDisplayNameFromPosition(params.positionName);
  if (!displayName) {
    return {
      clubId: null,
      reason: "invalid_position_name",
      displayName: null,
      candidateClubIds: [],
      eligibleClubIds: [],
    };
  }

  const normalizedDisplay = normalizeClubDisplayName(displayName);
  let clubs = await prisma.club.findMany({
    where: { name: displayName },
    select: { id: true, name: true },
  });
  if (clubs.length === 0) {
    const allClubs = await prisma.club.findMany({
      select: { id: true, name: true },
    });
    clubs = allClubs.filter((c) => normalizeClubDisplayName(c.name) === normalizedDisplay);
  }
  if (clubs.length === 0) {
    return {
      clubId: null,
      reason: "no_name_match",
      displayName,
      candidateClubIds: [],
      eligibleClubIds: [],
    };
  }

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

  if (eligible.length === 1) {
    return {
      clubId: eligible[0]!,
      reason: "ok",
      displayName,
      candidateClubIds: clubs.map((c) => c.id),
      eligibleClubIds: eligible,
    };
  }
  return {
    clubId: null,
    reason: eligible.length === 0 ? "not_eligible" : "ambiguous_eligible",
    displayName,
    candidateClubIds: clubs.map((c) => c.id),
    eligibleClubIds: eligible,
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
  const resolved = await resolveClubIdForTechnicalOfficialApplicationWithDiagnostic(prisma, params);
  return resolved.clubId;
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
