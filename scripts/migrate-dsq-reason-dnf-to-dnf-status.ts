/**
 * 過去データ: status=DSQ かつ理由/備考に「DNF」を含む行を DNF に昇格する。
 *
 * 用法:
 *   pnpm tsx scripts/migrate-dsq-reason-dnf-to-dnf-status.ts --dry-run
 *   pnpm tsx scripts/migrate-dsq-reason-dnf-to-dnf-status.ts --apply
 *   pnpm tsx scripts/migrate-dsq-reason-dnf-to-dnf-status.ts --apply --competition-id <id>
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";

const DNF_IN_REASON = "DNF";

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--apply");
  const competitionIdIdx = args.indexOf("--competition-id");
  const competitionId =
    competitionIdIdx >= 0 ? args[competitionIdIdx + 1] : undefined;
  return { dryRun, competitionId };
}

function participantWhere(competitionId?: string) {
  return {
    status: "DSQ" as const,
    reason: { contains: DNF_IN_REASON },
    ...(competitionId ? { competitionId } : {}),
  };
}

function officialRowWhere(competitionId?: string) {
  return {
    status: "DSQ" as const,
    remarks: { contains: DNF_IN_REASON },
    ...(competitionId
      ? {
          officialResult: { competitionId },
        }
      : {}),
  };
}

function draftRowWhere(competitionId?: string) {
  return {
    status: "DSQ" as const,
    remarks: { contains: DNF_IN_REASON },
    ...(competitionId
      ? {
          draft: { competitionId },
        }
      : {}),
  };
}

async function main() {
  const { dryRun, competitionId } = parseArgs();

  const participantCount = await prisma.competitionParticipantStatus.count({
    where: participantWhere(competitionId),
  });
  const officialCount = await prisma.officialResultRow.count({
    where: officialRowWhere(competitionId),
  });
  const draftCount = await prisma.competitionResultDraftRow.count({
    where: draftRowWhere(competitionId),
  });

  let participantUpdated = 0;
  let officialUpdated = 0;
  let draftUpdated = 0;

  if (!dryRun) {
    const p = await prisma.competitionParticipantStatus.updateMany({
      where: participantWhere(competitionId),
      data: { status: "DNF" },
    });
    participantUpdated = p.count;

    const o = await prisma.officialResultRow.updateMany({
      where: officialRowWhere(competitionId),
      data: { status: "DNF" },
    });
    officialUpdated = o.count;

    const d = await prisma.competitionResultDraftRow.updateMany({
      where: draftRowWhere(competitionId),
      data: { status: "DNF" },
    });
    draftUpdated = d.count;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        competitionId: competitionId ?? null,
        participantStatus: { matched: participantCount, updated: participantUpdated },
        officialResultRow: { matched: officialCount, updated: officialUpdated },
        competitionResultDraftRow: { matched: draftCount, updated: draftUpdated },
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
  .finally(async () => {
    await prisma.$disconnect();
  });
