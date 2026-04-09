/**
 * 指定した大会について、マーシャル「締切」状態だけを締切前に戻す（スタートリスト運用の巻き戻し）。
 *
 * 対象:
 * - CompetitionHeatMarshalState … 全ヒートの callClosedAt を null（締切解除）
 * - competition.startListSettings … dayOpsCallClosedEventIds を空に（種目全体の召集締切解除）
 *
 * 触れないもの（必要なら別途対応）:
 * - CompetitionStartListSnapshot の JSON（ヒート構成・次ラブロックはそのまま）
 * - CompetitionParticipantStatus（CALLED / DSQ などはそのまま）
 * - 公式結果・OfficialResultHeatConfirmed
 *
 * Usage:
 *   node --env-file=.env.local scripts/reset-marshal-close-state.mjs --competition-id=<cuid>
 *   node --env-file=.env.local scripts/reset-marshal-close-state.mjs --competition-id=<cuid> --dry-run
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs() {
  const argv = process.argv.slice(2);
  let competitionId = null;
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--competition-id=")) competitionId = a.slice("--competition-id=".length).trim();
    else if (!a.startsWith("--") && !competitionId) competitionId = a.trim();
  }
  return { competitionId, dryRun };
}

function clearDayOpsCallClosedInSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return settings;
  }
  const next = { ...settings };
  if ("dayOpsCallClosedEventIds" in next) {
    next.dayOpsCallClosedEventIds = [];
  }
  return next;
}

async function main() {
  const { competitionId, dryRun } = parseArgs();
  if (!competitionId) {
    console.error(
      "使い方: node scripts/reset-marshal-close-state.mjs --competition-id=<大会ID> [--dry-run]"
    );
    process.exit(1);
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, name: true, startListSettings: true },
  });
  if (!competition) {
    console.error(`大会が見つかりません: ${competitionId}`);
    process.exit(1);
  }

  const closedHeats = await prisma.competitionHeatMarshalState.count({
    where: { competitionId, callClosedAt: { not: null } },
  });
  const allMarshalRows = await prisma.competitionHeatMarshalState.count({
    where: { competitionId },
  });

  const settings = competition.startListSettings;
  const hadCallWindow =
    settings &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    Array.isArray(settings.dayOpsCallClosedEventIds) &&
    settings.dayOpsCallClosedEventIds.length > 0;

  console.log(`大会: ${competition.name} (${competition.id})`);
  console.log(`  ヒート別マーシャル行数: ${allMarshalRows}（うち締切済み callClosedAt あり: ${closedHeats}）`);
  console.log(`  種目召集締切 (dayOpsCallClosedEventIds 非空): ${hadCallWindow ? "あり → 解除" : "なし"}`);

  if (dryRun) {
    console.log("--dry-run のため DB は更新しません。");
    return;
  }

  const heatResult = await prisma.competitionHeatMarshalState.updateMany({
    where: { competitionId },
    data: { callClosedAt: null },
  });

  console.log(`完了: CompetitionHeatMarshalState を ${heatResult.count} 件更新（callClosedAt をクリア）`);

  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    await prisma.competition.update({
      where: { id: competitionId },
      data: { startListSettings: clearDayOpsCallClosedInSettings(settings) },
    });
    console.log("完了: startListSettings の dayOpsCallClosedEventIds を空にしました。");
  } else {
    console.log("スキップ: startListSettings がオブジェクトでないため dayOpsCallClosedEventIds は触りません。");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
