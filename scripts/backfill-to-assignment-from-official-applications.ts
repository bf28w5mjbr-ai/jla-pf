/**
 * 既存の「TOとして」公式オフィシャル応募（positionName がテクニカルオフィシャル（クラブ名））から、
 * CompetitionTechnicalOfficialAssignment が未作成の環境向けバックフィル。
 * resolveOfficialApplicationPositionName と同じ要件でクラブを特定できる行のみ処理します。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/backfill-to-assignment-from-official-applications.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/backfill-to-assignment-from-official-applications.ts
 */
import type { OfficialApplicationCompetitionForSubmit } from "@/lib/officialApplicationSubmit";
import { resolveOfficialApplicationPositionName } from "@/lib/officialApplicationSubmit";
import { syncTechnicalOfficialAssignmentFromOfficialApplication } from "@/lib/syncTechnicalOfficialAssignmentFromOfficialApplication";
import { prisma } from "@/server/db";

const TO_POSITION = /^テクニカルオフィシャル（([^）]+)）$/;

function parseArgs() {
  let dryRun = false;
  for (const a of process.argv.slice(2)) {
    if (a === "--") continue;
    if (a === "--dry-run") dryRun = true;
  }
  return { dryRun };
}

function extractClubDisplayName(positionName: string): string | null {
  const m = positionName.match(TO_POSITION);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

async function loadCompetitionForResolve(
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

async function resolveClubIdForApplication(params: {
  competition: OfficialApplicationCompetitionForSubmit;
  competitionId: string;
  userId: string;
  positionName: string;
}): Promise<string | null> {
  const displayName = extractClubDisplayName(params.positionName);
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

async function main() {
  const { dryRun } = parseArgs();

  const applications = await prisma.competitionOfficialApplication.findMany({
    where: {
      status: "APPROVED",
      positionName: { startsWith: "テクニカルオフィシャル（" },
    },
    select: {
      id: true,
      competitionId: true,
      userId: true,
      positionName: true,
    },
    orderBy: [{ competitionId: "asc" }, { userId: "asc" }],
  });

  let applied = 0;
  let skipped = 0;

  const competitionCache = new Map<string, OfficialApplicationCompetitionForSubmit | null>();

  for (const app of applications) {
    let competition = competitionCache.get(app.competitionId);
    if (competition === undefined) {
      competition = await loadCompetitionForResolve(app.competitionId);
      competitionCache.set(app.competitionId, competition);
    }
    if (!competition?.technicalOfficialRecruitmentEnabled) {
      skipped += 1;
      continue;
    }

    const clubId = await resolveClubIdForApplication({
      competition,
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
    });
    if (!clubId) {
      skipped += 1;
      console.warn(
        `[skip] application ${app.id} competition=${app.competitionId} user=${app.userId} position="${app.positionName}"`
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] would sync application ${app.id} -> competition ${app.competitionId} club ${clubId} user ${app.userId}`
      );
    } else {
      await prisma.$transaction(async (tx) => {
        await syncTechnicalOfficialAssignmentFromOfficialApplication(tx, {
          competitionId: app.competitionId,
          userId: app.userId,
          entryType: "TECHNICAL",
          clubId,
        });
      });
    }
    applied += 1;
  }

  console.log(
    dryRun ? `Done (dry-run). Would apply ${applied}, skipped ${skipped}.` : `Done. Applied ${applied}, skipped ${skipped}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
