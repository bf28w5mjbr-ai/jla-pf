import "./loadScriptEnv";

/**
 * 同一大会・同一クラブ・同一種目にチームが1組だけなのに、
 * チーム名が「略称／正式名 + 空白（任意）+ ラテン大文字（半角・全角Ａ–Ｚ）」の自動命名形式のとき、
 * 同一種目1組のみの行の teamName を略称（なければ正式名）のみに直す。
 *
 * Usage:
 *   pnpm backfill:team-entry-single-suffix:dry
 *   pnpm backfill:team-entry-single-suffix
 *
 * 環境変数はプロジェクト直下の `.env` および存在すれば `.env.local` から読み込む（`--env-file` は使わない）。
 *
 * Options:
 *   --dry-run または --apply が無いとき: 更新しない（件数とサンプルのみ表示）
 *   --apply    DB を更新する
 *   --competitionId=<cuid>  指定大会のみ
 */
import { prisma } from "@/server/db";
import {
  clubTeamNameBaseFromClub,
  shouldStripLetterSuffixForSingleTeam,
} from "@/lib/teamEntryClubBaseName";

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  let competitionId: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--competitionId=")) {
      competitionId = a.slice("--competitionId=".length).trim() || null;
    }
  }
  return { dryRun, competitionId };
}

async function main() {
  const { dryRun, competitionId } = parseArgs();

  const rows = await prisma.teamEntry.findMany({
    where: competitionId ? { competitionId } : {},
    select: {
      id: true,
      competitionId: true,
      clubId: true,
      eventId: true,
      teamName: true,
      club: { select: { abbreviation: true, name: true } },
    },
  });

  const groupKey = (r: (typeof rows)[number]) =>
    `${r.competitionId}\t${r.clubId}\t${r.eventId}`;
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = groupKey(r);
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }

  const toFix: { id: string; from: string; to: string; competitionId: string }[] = [];
  for (const [, list] of byKey) {
    if (list.length !== 1) continue;
    const row = list[0];
    const base = clubTeamNameBaseFromClub(row.club);
    if (shouldStripLetterSuffixForSingleTeam(row.club, row.teamName)) {
      toFix.push({
        id: row.id,
        from: row.teamName,
        to: base,
        competitionId: row.competitionId,
      });
    }
  }

  console.log(
    dryRun
      ? `[dry-run] 更新候補: ${toFix.length} 件（--apply で実行）`
      : `[apply] 更新実行: ${toFix.length} 件`
  );
  const preview = toFix.slice(0, 15);
  for (const p of preview) {
    console.log(`  ${p.competitionId} / ${p.id}: "${p.from}" -> "${p.to}"`);
  }
  if (toFix.length > preview.length) {
    console.log(`  … 他 ${toFix.length - preview.length} 件`);
  }

  if (dryRun || toFix.length === 0) {
    return;
  }

  for (const p of toFix) {
    await prisma.teamEntry.update({
      where: { id: p.id },
      data: { teamName: p.to },
    });
  }
  console.log("完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
