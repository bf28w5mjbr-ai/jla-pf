/**
 * 関係組織の旧6フィールドを relatedOrganizations JSON に統合する。
 *
 * 旧カラムが残っている DB: 旧データを relatedOrganizations へ移行する。
 * 旧カラム削除済み DB: 移行対象なしとして正常終了（relatedOrganizations の件数のみ報告）。
 *
 * Usage:
 *   pnpm tsx scripts/migrate-competition-related-organizations.ts --dry-run
 *   pnpm tsx scripts/migrate-competition-related-organizations.ts --apply
 *
 * Options:
 *   --dry-run
 *   --apply
 *   --competitionId=<cuid>
 */
import {
  migrateLegacyRelatedOrganizations,
  normalizeRelatedOrganizations,
} from "@/lib/competitionRelatedOrganizations";
import { prisma } from "@/server/db";

type LegacyCompetitionRow = {
  id: string;
  name: string;
  relatedOrganizations: unknown;
  sponsors: string | null;
  cooperators: string | null;
  cooperatorsLogos: unknown;
  supporters: string | null;
  grants: string | null;
  grantsLogos: unknown;
};

type CurrentCompetitionRow = {
  id: string;
  name: string;
  relatedOrganizations: unknown;
};

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

async function legacyColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Competition'
        AND column_name = 'sponsors'
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function fetchLegacyRows(competitionId: string | null): Promise<LegacyCompetitionRow[]> {
  if (competitionId) {
    return prisma.$queryRaw<LegacyCompetitionRow[]>`
      SELECT
        id,
        name,
        "relatedOrganizations",
        sponsors,
        cooperators,
        "cooperatorsLogos",
        supporters,
        grants,
        "grantsLogos"
      FROM "Competition"
      WHERE id = ${competitionId}
    `;
  }
  return prisma.$queryRaw<LegacyCompetitionRow[]>`
    SELECT
      id,
      name,
      "relatedOrganizations",
      sponsors,
      cooperators,
      "cooperatorsLogos",
      supporters,
      grants,
      "grantsLogos"
    FROM "Competition"
  `;
}

async function fetchCurrentRows(competitionId: string | null): Promise<CurrentCompetitionRow[]> {
  if (competitionId) {
    return prisma.competition.findMany({
      where: { id: competitionId },
      select: { id: true, name: true, relatedOrganizations: true },
    });
  }
  return prisma.competition.findMany({
    select: { id: true, name: true, relatedOrganizations: true },
  });
}

async function reportCurrentState(competitions: CurrentCompetitionRow[]) {
  let withOrgs = 0;
  let empty = 0;
  for (const c of competitions) {
    const orgs = normalizeRelatedOrganizations(c.relatedOrganizations);
    if (orgs.length > 0) {
      withOrgs++;
    } else {
      empty++;
    }
  }
  console.log(
    `旧カラムは既に削除済みです。移行スクリプトの対象データはありません。`,
  );
  console.log(
    `relatedOrganizations: 登録あり=${withOrgs}, 空=${empty}, 合計=${competitions.length}`,
  );
}

async function main() {
  const { dryRun, competitionId } = parseArgs();
  console.log(dryRun ? "[dry-run]" : "[apply]", "migrate-competition-related-organizations");

  const hasLegacy = await legacyColumnsExist();
  if (!hasLegacy) {
    const competitions = await fetchCurrentRows(competitionId);
    await reportCurrentState(competitions);
    return;
  }

  console.log("旧カラムを検出しました。relatedOrganizations へ移行します。");
  const competitions = await fetchLegacyRows(competitionId);

  let updated = 0;
  let skipped = 0;

  for (const c of competitions) {
    const existing = normalizeRelatedOrganizations(c.relatedOrganizations);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const migrated = migrateLegacyRelatedOrganizations({
      sponsors: c.sponsors,
      cooperators: c.cooperators,
      cooperatorsLogos: c.cooperatorsLogos,
      supporters: c.supporters,
      grants: c.grants,
      grantsLogos: c.grantsLogos,
    });

    if (migrated.length === 0) {
      skipped++;
      continue;
    }

    console.log(`  ${c.id} (${c.name}): ${migrated.length} org(s)`);
    if (!dryRun) {
      await prisma.competition.update({
        where: { id: c.id },
        data: { relatedOrganizations: migrated },
      });
    }
    updated++;
  }

  console.log(`done: updated=${updated}, skipped=${skipped}, total=${competitions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
