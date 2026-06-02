/**
 * 指定ヒートの公式リザルト行（着順・ランアップ）を削除する。確定済みヒートは不可。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/clear-heat-result-rows.ts \
 *     --competition-id=... --event-id=... --round=FINAL --heat=1 [--dry-run|--execute]
 */
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";

function parseArgs() {
  const argv = process.argv.slice(2);
  let competitionId = "";
  let eventId = "";
  let round: ResultRound | null = null;
  let heat = 1;
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
      "使い方: scripts/clear-heat-result-rows.ts --competition-id=... --event-id=... --round=FINAL --heat=1 [--execute]"
    );
    process.exit(1);
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: { name: true },
  });
  if (!event) {
    console.error("種目が見つかりません");
    process.exit(1);
  }

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: {
      id: true,
      lockedAt: true,
      heatConfirmations: { where: { heat }, select: { heat: true } },
      rows: {
        where: { heat, status: "OK" },
        select: { id: true, lane: true, rank: true, advanceWithoutRank: true },
        orderBy: [{ rank: "asc" }, { lane: "asc" }],
      },
    },
  });

  if (!official) {
    console.log("公式結果なし");
    return;
  }

  console.log(`種目: ${event.name}`);
  console.log(`${round} ヒート ${heat}`);
  console.log(`lockedAt: ${official.lockedAt?.toISOString() ?? "null"}`);
  console.log(`確定: ${official.heatConfirmations.length > 0 ? "あり" : "なし"}`);
  console.log(`削除対象行: ${official.rows.length} 件`, official.rows);
  console.log(dryRun ? "[dry-run]" : "[execute]");

  if (official.lockedAt) {
    console.error("公式結果ロック済み");
    process.exit(1);
  }
  if (official.heatConfirmations.length > 0) {
    console.error("ヒート確定済みのため削除できません。先に確定解除してください。");
    process.exit(1);
  }

  const draftRow = await prisma.dayOpsHeatOperationDraft.findUnique({
    where: {
      competitionId_eventId_round_heatIndex: { competitionId, eventId, round, heatIndex: heat },
    },
    select: { id: true, resultDraftPayload: true },
  });
  if (draftRow?.resultDraftPayload != null) {
    console.log("未確定チェック下書き: あり");
  }

  if (official.rows.length === 0 && draftRow?.resultDraftPayload == null) {
    console.log("削除対象なし");
    return;
  }

  if (dryRun) return;

  const deleted = await prisma.officialResultRow.deleteMany({
    where: {
      officialResultId: official.id,
      heat,
      status: "OK",
    },
  });

  let clearedDraft = false;
  if (draftRow?.resultDraftPayload != null) {
    await prisma.dayOpsHeatOperationDraft.update({
      where: { id: draftRow.id },
      data: { resultDraftPayload: null },
    });
    clearedDraft = true;
  }

  console.log(
    `完了: OfficialResultRow ${deleted.count} 件削除` +
      (clearedDraft ? "、未確定チェック下書きをクリア" : "")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
