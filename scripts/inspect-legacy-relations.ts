import pg from "pg";
import { readFileSync } from "fs";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL not found");
}

async function main() {
  const c = new pg.Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Competition'
    AND column_name IN ('relatedOrganizations','sponsors','cooperators','cooperatorsLogos','supporters','grants','grantsLogos')
    ORDER BY column_name`);
  console.log("カラム:", cols.rows.map((r) => r.column_name).join(", ") || "(なし)");

  const data = await c.query(`
    SELECT id, name,
      sponsors, cooperators, supporters, grants,
      "cooperatorsLogos", "grantsLogos"
    FROM "Competition" ORDER BY name`);

  for (const r of data.rows) {
    const parts: string[] = [];
    if (r.sponsors?.trim()) parts.push(`後援(${r.sponsors.trim().split(/\r?\n/).length}行)`);
    if (r.cooperators?.trim()) parts.push(`協賛(${r.cooperators.trim().split(/\r?\n/).length}行)`);
    if (r.supporters?.trim()) parts.push(`協力(${r.supporters.trim().split(/\r?\n/).length}行)`);
    if (r.grants?.trim()) parts.push(`助成(${r.grants.trim().split(/\r?\n/).length}行)`);
    const coopLogos = Array.isArray(r.cooperatorsLogos) ? r.cooperatorsLogos.length : 0;
    const grantLogos = Array.isArray(r.grantsLogos) ? r.grantsLogos.length : 0;
    if (coopLogos) parts.push(`協賛ロゴ${coopLogos}件`);
    if (grantLogos) parts.push(`助成ロゴ${grantLogos}件`);
    console.log(`\n${r.name}`);
    console.log(`  id: ${r.id}`);
    console.log(`  ${parts.length ? parts.join(", ") : "関係組織データなし"}`);
    if (r.sponsors?.trim()) console.log(`  後援: ${r.sponsors.trim().slice(0, 120)}${r.sponsors.length > 120 ? "…" : ""}`);
    if (r.cooperators?.trim()) console.log(`  協賛: ${r.cooperators.trim().slice(0, 120)}${r.cooperators.length > 120 ? "…" : ""}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
