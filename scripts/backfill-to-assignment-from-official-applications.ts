/**
 * 既存の「TOとして」公式オフィシャル応募（positionName がテクニカルオフィシャル（クラブ名））から、
 * CompetitionTechnicalOfficialAssignment が未作成の環境向けバックフィル。
 * resolveOfficialApplicationPositionName と同じ要件でクラブを特定できる行のみ処理します。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/backfill-to-assignment-from-official-applications.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/backfill-to-assignment-from-official-applications.ts
 */
import {
  loadCompetitionForTechnicalOfficialApplicationResolve,
  resolveClubIdForTechnicalOfficialApplicationWithDiagnostic,
  type ResolveTechnicalOfficialClubDiagnosticReason,
} from "@/lib/resolveTechnicalOfficialApplicationClub";
import { syncTechnicalOfficialAssignmentFromOfficialApplication } from "@/lib/syncTechnicalOfficialAssignmentFromOfficialApplication";
import { prisma } from "@/server/db";

function parseArgs() {
  let dryRun = false;
  for (const a of process.argv.slice(2)) {
    if (a === "--") continue;
    if (a === "--dry-run") dryRun = true;
  }
  return { dryRun };
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
  const skippedReasonCount = new Map<ResolveTechnicalOfficialClubDiagnosticReason, number>();

  const competitionCache = new Map<
    string,
    Awaited<ReturnType<typeof loadCompetitionForTechnicalOfficialApplicationResolve>>
  >();

  for (const app of applications) {
    let competition = competitionCache.get(app.competitionId);
    if (competition === undefined) {
      competition = await loadCompetitionForTechnicalOfficialApplicationResolve(
        prisma,
        app.competitionId
      );
      competitionCache.set(app.competitionId, competition);
    }
    if (!competition?.technicalOfficialRecruitmentEnabled) {
      skipped += 1;
      continue;
    }

    const resolved = await resolveClubIdForTechnicalOfficialApplicationWithDiagnostic(prisma, {
      competition,
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
    });
    const clubId = resolved.clubId;
    if (!clubId) {
      skipped += 1;
      skippedReasonCount.set(resolved.reason, (skippedReasonCount.get(resolved.reason) ?? 0) + 1);
      console.warn(
        `[skip:${resolved.reason}] application ${app.id} competition=${app.competitionId} user=${app.userId} position="${app.positionName}"`
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
  if (skippedReasonCount.size > 0) {
    console.log("Skipped reason summary:");
    for (const [reason, count] of [...skippedReasonCount.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${reason}: ${count}`);
    }
  }
  console.log(
    "Next: run diagnose script before/after apply to verify unresolved rows are reduced."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
