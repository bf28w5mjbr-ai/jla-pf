/**
 * バックアップ／旧 DB（SOURCE_DATABASE_URL）から関係組織データを復元する。
 * 旧6カラムが残っているソース、または relatedOrganizations 済みソースの両方に対応。
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://..." pnpm tsx scripts/recover-competition-related-organizations-from-source.ts --dry-run
 *   SOURCE_DATABASE_URL="postgresql://..." pnpm tsx scripts/recover-competition-related-organizations-from-source.ts --apply
 *
 * Options:
 *   --dry-run
 *   --apply
 *   --competitionId=<cuid>   特定大会のみ
 *   --overwrite              既に relatedOrganizations がある大会も上書き
 */
import pg from "pg";
import {
  migrateLegacyRelatedOrganizations,
  normalizeRelatedOrganizations,
} from "@/lib/competitionRelatedOrganizations";
import { prisma } from "@/server/db";

type SourceRow = {
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

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const overwrite = argv.includes("--overwrite");
  let competitionId: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--competitionId=")) {
      competitionId = a.slice("--competitionId=".length).trim() || null;
    }
  }
  return { dryRun, overwrite, competitionId };
}

function stripSslParams(connectionString: string): string {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "http:"));
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    const href = u.toString();
    return `postgresql:${href.slice("http:".length)}`;
  } catch {
    return connectionString;
  }
}

async function sourceHasLegacyColumns(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Competition'
        AND column_name = 'sponsors'
    ) AS exists
  `);
  return rows[0]?.exists === true;
}

async function fetchSourceRows(
  client: pg.Client,
  hasLegacy: boolean,
  competitionId: string | null,
): Promise<SourceRow[]> {
  const where = competitionId ? `WHERE id = $1` : "";
  const params = competitionId ? [competitionId] : [];

  if (hasLegacy) {
    const { rows } = await client.query<SourceRow>(
      `
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
      ${where}
      ORDER BY id
      `,
      params,
    );
    return rows;
  }

  const { rows } = await client.query<SourceRow>(
    `
    SELECT
      id,
      name,
      "relatedOrganizations",
      NULL::text AS sponsors,
      NULL::text AS cooperators,
      NULL::jsonb AS "cooperatorsLogos",
      NULL::text AS supporters,
      NULL::text AS grants,
      NULL::jsonb AS "grantsLogos"
    FROM "Competition"
    ${where}
    ORDER BY id
    `,
    params,
  );
  return rows;
}

function resolveOrganizationsFromSource(row: SourceRow): ReturnType<typeof normalizeRelatedOrganizations> {
  const fromNew = normalizeRelatedOrganizations(row.relatedOrganizations);
  if (fromNew.length > 0) return fromNew;
  return migrateLegacyRelatedOrganizations({
    sponsors: row.sponsors,
    cooperators: row.cooperators,
    cooperatorsLogos: row.cooperatorsLogos,
    supporters: row.supporters,
    grants: row.grants,
    grantsLogos: row.grantsLogos,
  });
}

async function main() {
  const { dryRun, overwrite, competitionId } = parseArgs();
  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  if (!sourceUrl) {
    console.error("SOURCE_DATABASE_URL が必要です（PITR / Neon ブランチ / 旧 DB の接続文字列）");
    process.exit(1);
  }

  console.log(dryRun ? "[dry-run]" : "[apply]", "recover-competition-related-organizations-from-source");

  const client = new pg.Client({
    connectionString: stripSslParams(sourceUrl),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const hasLegacy = await sourceHasLegacyColumns(client);
    console.log(hasLegacy ? "ソース: 旧6カラムあり" : "ソース: relatedOrganizations のみ");

    const sourceRows = await fetchSourceRows(client, hasLegacy, competitionId);
    if (sourceRows.length === 0) {
      console.log("ソースに大会が見つかりません");
      return;
    }

    let restored = 0;
    let skipped = 0;
    let missingOnTarget = 0;

    for (const src of sourceRows) {
      const orgs = resolveOrganizationsFromSource(src);
      if (orgs.length === 0) {
        skipped++;
        continue;
      }

      const target = await prisma.competition.findUnique({
        where: { id: src.id },
        select: { id: true, name: true, relatedOrganizations: true },
      });

      if (!target) {
        console.log(`  skip (target に存在しない): ${src.id} (${src.name})`);
        missingOnTarget++;
        continue;
      }

      const current = normalizeRelatedOrganizations(target.relatedOrganizations);
      if (current.length > 0 && !overwrite) {
        console.log(`  skip (既に登録あり): ${src.id} (${target.name})`);
        skipped++;
        continue;
      }

      console.log(`  restore ${src.id} (${target.name}): ${orgs.length} org(s)`);
      if (!dryRun) {
        await prisma.competition.update({
          where: { id: src.id },
          data: { relatedOrganizations: orgs },
        });
      }
      restored++;
    }

    console.log(
      `done: restored=${restored}, skipped=${skipped}, missingOnTarget=${missingOnTarget}, source=${sourceRows.length}`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
