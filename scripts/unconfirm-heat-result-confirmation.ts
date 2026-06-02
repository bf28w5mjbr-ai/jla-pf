/**
 * 指定種目・ラウンドのヒート単位リザルト確定（OfficialResultHeatConfirmed）を解除する。
 * 公式結果行（OfficialResultRow）は残す。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/unconfirm-heat-result-confirmation.ts \
 *     --competition-id=... --event-id=... --round=FINAL [--heat=1] [--dry-run]
 *   ... --execute
 */
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";

function parseArgs() {
  const argv = process.argv.slice(2);
  let competitionId = "";
  let eventId = "";
  let round: ResultRound | null = null;
  let heat: number | null = null;
  let dryRun = true;
  for (const a of argv) {
    if (a === "--execute") dryRun = false;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--competition-id=")) competitionId = a.slice("--competition-id=".length).trim();
    else if (a.startsWith("--event-id=")) eventId = a.slice("--event-id=".length).trim();
    else if (a.startsWith("--round=")) {
      const r = a.slice("--round=".length).trim().toUpperCase();
      if (r === "HEAT" || r === "SEMI" || r === "FINAL") round = r;
    } else if (a.startsWith("--heat=")) {
      const n = Number(a.slice("--heat=".length));
      if (Number.isInteger(n) && n >= 1) heat = n;
    }
  }
  return { competitionId, eventId, round, heat, dryRun };
}

async function main() {
  const { competitionId, eventId, round, heat, dryRun } = parseArgs();
  if (!competitionId || !eventId || !round) {
    console.error(
      "使い方: pnpm exec tsx scripts/unconfirm-heat-result-confirmation.ts " +
        "--competition-id=<id> --event-id=<id> --round=FINAL [--heat=1] [--dry-run|--execute]"
    );
    process.exit(1);
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: { id: true, name: true, sex: true },
  });
  if (!event) {
    console.error(`種目が見つかりません: ${eventId}`);
    process.exit(1);
  }

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: {
      id: true,
      lockedAt: true,
      heatConfirmations: { orderBy: { heat: "asc" }, select: { id: true, heat: true, confirmedAt: true } },
    },
  });

  if (!official) {
    console.log(`公式結果なし (${round}) — 解除対象なし`);
    return;
  }

  const targets =
    heat != null
      ? official.heatConfirmations.filter((c) => c.heat === heat)
      : official.heatConfirmations;

  console.log(`種目: ${event.name} (${event.id}) ${event.sex ?? ""}`);
  console.log(`ラウンド: ${round}`);
  console.log(`lockedAt: ${official.lockedAt?.toISOString() ?? "null"}`);
  console.log(`確定済みヒート:`, official.heatConfirmations);
  console.log(dryRun ? "[dry-run]" : "[execute]");

  if (official.lockedAt) {
    console.error("種目全体の公式結果がロック済みのため、ヒート確定の解除はできません。");
    process.exit(1);
  }

  if (targets.length === 0) {
    console.log(heat != null ? `ヒート ${heat} は確定済みではありません。` : "確定済みヒートがありません。");
    return;
  }

  if (dryRun) {
    console.log(`解除予定: heat ${targets.map((t) => t.heat).join(", ")} (${targets.length} 件)`);
    return;
  }

  const deleted = await prisma.officialResultHeatConfirmed.deleteMany({
    where: {
      id: { in: targets.map((t) => t.id) },
    },
  });

  console.log(`完了: OfficialResultHeatConfirmed を ${deleted.count} 件削除しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
