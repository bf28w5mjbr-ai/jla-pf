/**
 * 関係組織データの状態を一覧表示する（一時診断用）。
 */
import { normalizeRelatedOrganizations } from "@/lib/competitionRelatedOrganizations";
import { prisma } from "@/server/db";
import pg from "pg";

function stripSslParams(connectionString: string): string {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "http:"));
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    return `postgresql:${u.toString().slice("http:".length)}`;
  } catch {
    return connectionString;
  }
}

async function legacyColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Competition' AND column_name = 'sponsors'
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function main() {
  const hasLegacy = await legacyColumnsExist();
  console.log("=== 現行 DB (DATABASE_URL) ===");
  console.log("旧6カラム:", hasLegacy ? "あり" : "なし（drop 済み）");

  const comps = await prisma.competition.findMany({
    select: { id: true, name: true, relatedOrganizations: true },
    orderBy: { name: "asc" },
  });

  let withNew = 0;
  let emptyNew = 0;
  for (const c of comps) {
    const orgs = normalizeRelatedOrganizations(c.relatedOrganizations);
    if (orgs.length > 0) withNew++;
    else emptyNew++;
    console.log(`\n[${c.id}] ${c.name}`);
    console.log(`  relatedOrganizations: ${orgs.length} 件`);
    for (const o of orgs) {
      console.log(`    - [${o.role}] ${o.name}${o.logoUrl ? " (logo)" : ""}`);
    }
  }
  console.log(`\n合計: ${comps.length} 大会 / relatedOrganizations あり=${withNew}, 空=${emptyNew}`);

  if (hasLegacy) {
    const legacy = await prisma.$queryRaw<
      {
        id: string;
        name: string;
        sponsors: string | null;
        cooperators: string | null;
        supporters: string | null;
        grants: string | null;
      }[]
    >`
      SELECT id, name, sponsors, cooperators, supporters, grants
      FROM "Competition"
      ORDER BY name
    `;
    console.log("\n=== 旧テキスト列（移行未実行分） ===");
    for (const row of legacy) {
      const parts = [
        row.sponsors?.trim() && `後援`,
        row.cooperators?.trim() && `協賛`,
        row.supporters?.trim() && `協力`,
        row.grants?.trim() && `助成`,
      ].filter(Boolean);
      if (parts.length === 0) continue;
      console.log(`  ${row.name}: ${parts.join(", ")} にデータあり`);
    }
  }

  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  if (sourceUrl) {
    console.log("\n=== SOURCE_DATABASE_URL ===");
    const client = new pg.Client({
      connectionString: stripSslParams(sourceUrl),
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      const { rows: srcLegacyCheck } = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Competition' AND column_name = 'sponsors'
        ) AS exists
      `);
      const srcHasLegacy = srcLegacyCheck[0]?.exists === true;
      console.log("旧6カラム:", srcHasLegacy ? "あり" : "なし");

      const { rows } = await client.query<{ id: string; name: string; relatedOrganizations: unknown }>(
        `SELECT id, name, "relatedOrganizations" FROM "Competition" ORDER BY name`,
      );
      for (const r of rows) {
        const n = normalizeRelatedOrganizations(r.relatedOrganizations).length;
        if (n > 0) console.log(`  ${r.name}: relatedOrganizations ${n} 件`);
      }
    } finally {
      await client.end().catch(() => {});
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
