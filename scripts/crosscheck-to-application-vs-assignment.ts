/**
 * 承認済み TO 公式応募のうち、クラブまで解決できるが CompetitionTechnicalOfficialAssignment が無い行を列挙。
 * 問題の competitionId / clubId を特定する用途。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/crosscheck-to-application-vs-assignment.ts
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/crosscheck-to-application-vs-assignment.ts --limit=100
 */
import {
  loadCompetitionForTechnicalOfficialApplicationResolve,
  resolveClubIdForTechnicalOfficialApplication,
} from "@/lib/resolveTechnicalOfficialApplicationClub";
import { prisma } from "@/server/db";

function parseArgs() {
  let limit: number | null = null;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { limit };
}

async function main() {
  const { limit } = parseArgs();

  const apps = await prisma.competitionOfficialApplication.findMany({
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
    orderBy: [{ id: "asc" }],
    ...(limit != null ? { take: limit } : {}),
  });

  const competitionCache = new Map<
    string,
    Awaited<ReturnType<typeof loadCompetitionForTechnicalOfficialApplicationResolve>>
  >();

  let missing = 0;
  let skippedNoClub = 0;
  let hasAssignment = 0;

  for (const app of apps) {
    let comp = competitionCache.get(app.competitionId);
    if (comp === undefined) {
      comp = await loadCompetitionForTechnicalOfficialApplicationResolve(prisma, app.competitionId);
      competitionCache.set(app.competitionId, comp);
    }
    if (!comp?.technicalOfficialRecruitmentEnabled) {
      skippedNoClub += 1;
      continue;
    }

    const clubId = await resolveClubIdForTechnicalOfficialApplication(prisma, {
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
      competition: comp,
    });
    if (!clubId) {
      skippedNoClub += 1;
      continue;
    }

    const row = await prisma.competitionTechnicalOfficialAssignment.findUnique({
      where: {
        competitionId_clubId_userId: {
          competitionId: app.competitionId,
          clubId,
          userId: app.userId,
        },
      },
      select: { id: true },
    });
    if (row) {
      hasAssignment += 1;
    } else {
      missing += 1;
      console.log(
        `MISSING_ASSIGNMENT application=${app.id} competition=${app.competitionId} club=${clubId} user=${app.userId} position="${app.positionName}"`
      );
    }
  }

  console.log(
    `\nSummary (scanned ${apps.length}${limit != null ? `, take limit=${limit}` : ", all matching rows"}): assignment_ok=${hasAssignment} missing_assignment=${missing} unresolved_or_to_off=${skippedNoClub}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
