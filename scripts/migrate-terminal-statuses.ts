/**
 * 任意実行: マーシャル締切済みで PENDING のままの行を DNS に移行し、
 * legacy の DNS+「棄権」理由を WITHDRAWN に昇格する。
 *
 * 用法: pnpm tsx scripts/migrate-terminal-statuses.ts --competition-id <id> [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { MARSHAL_CLOSE_DNS_REASON } from "@/lib/marshalHeatCloseDns";

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const competitionIdIdx = args.indexOf("--competition-id");
  const competitionId =
    competitionIdIdx >= 0 ? args[competitionIdIdx + 1] : undefined;
  const dryRun = args.includes("--dry-run");
  if (!competitionId) {
    console.error("Usage: --competition-id <id> [--dry-run]");
    process.exit(1);
  }
  return { competitionId, dryRun };
}

async function main() {
  const { competitionId, dryRun } = parseArgs();

  const closedHeats = await prisma.competitionHeatMarshalState.findMany({
    where: { competitionId, callClosedAt: { not: null } },
    select: { eventId: true, round: true, heatIndex: true },
  });

  let pendingToDns = 0;
  for (const h of closedHeats) {
    const where = {
      competitionId,
      eventId: h.eventId,
      marshalRound: h.round,
      status: "PENDING" as const,
    };
    if (dryRun) {
      pendingToDns += await prisma.competitionParticipantStatus.count({ where });
    } else {
      const result = await prisma.competitionParticipantStatus.updateMany({
        where,
        data: {
          status: "DNS",
          reason: MARSHAL_CLOSE_DNS_REASON,
          calledAt: null,
        },
      });
      pendingToDns += result.count;
    }
  }

  const legacyWhere = {
    competitionId,
    status: "DNS" as const,
    reason: { contains: "棄権" },
  };
  const legacyWithdrawnCount = dryRun
    ? await prisma.competitionParticipantStatus.count({ where: legacyWhere })
    : (
        await prisma.competitionParticipantStatus.updateMany({
          where: legacyWhere,
          data: { status: "WITHDRAWN" },
        })
      ).count;

  console.log(
    JSON.stringify(
      {
        competitionId,
        dryRun,
        closedHeatCount: closedHeats.length,
        pendingToDns,
        legacyWithdrawnToWithDrawn: legacyWithdrawnCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
