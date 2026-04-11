/**
 * Copy all rows from public schema on SOURCE_DATABASE_URL (e.g. Neon)
 * into DATABASE_URL (e.g. Supabase). Skips _prisma_migrations (keep target history).
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://..." node --env-file=.env scripts/copy-public-schema-data.mjs
 *   SOURCE_DATABASE_URL="postgresql://..." node --env-file=.env scripts/copy-public-schema-data.mjs --dry-run
 *   SOURCE_DATABASE_URL="postgresql://..." node --env-file=.env scripts/copy-public-schema-data.mjs --truncate-first
 *
 * Prefer Neon direct (non-pooler) URL for the source. Target should be Supabase direct :5432.
 */
import pg from "pg";

const SKIP_TABLES = new Set(["_prisma_migrations"]);

function parseArgs() {
  const a = process.argv.slice(2);
  return {
    dryRun: a.includes("--dry-run"),
    truncateFirst: a.includes("--truncate-first"),
  };
}

function qIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

/** Node pg が sslmode=require を強い verify と解釈し rejectUnauthorized を無視することがあるため除去 */
function stripSslParams(connectionString) {
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

async function listPublicTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  return rows.map((r) => r.name).filter((n) => !SKIP_TABLES.has(n));
}

async function getColumnNames(client, table) {
  const { rows } = await client.query(
    `
    SELECT a.attname AS name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
    `,
    [table],
  );
  return rows.map((r) => r.name);
}

function normalizeRow(row, columns) {
  const out = [];
  for (const col of columns) {
    let v = row[col];
    if (v === undefined) {
      const lower = col.toLowerCase();
      for (const k of Object.keys(row)) {
        if (k.toLowerCase() === lower) {
          v = row[k];
          break;
        }
      }
    }
    out.push(v);
  }
  return out;
}

async function copyTable(source, target, table, columns, dryRun) {
  const tq = qIdent(table);
  const colSql = columns.map(qIdent).join(", ");
  const { rows } = await source.query(`SELECT ${colSql} FROM ${tq}`);
  if (dryRun) {
    console.log(`[dry-run] ${table}: ${rows.length} rows`);
    return rows.length;
  }
  if (rows.length === 0) return 0;

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO ${tq} (${colSql}) VALUES (${placeholders})`;

  const batchSize = 150;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    for (const row of chunk) {
      const values = normalizeRow(row, columns);
      await target.query(insertSql, values);
    }
  }
  return rows.length;
}

async function main() {
  const { dryRun, truncateFirst } = parseArgs();
  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  const targetUrl =
    process.env.TARGET_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!sourceUrl) {
    console.error(
      "Missing SOURCE_DATABASE_URL (Neon / old Postgres connection string).",
    );
    process.exit(1);
  }
  if (!targetUrl) {
    console.error("Missing DATABASE_URL or TARGET_DATABASE_URL.");
    process.exit(1);
  }

  const ssl = { rejectUnauthorized: false };
  const source = new pg.Client({
    connectionString: stripSslParams(sourceUrl),
    ssl,
  });
  const target = new pg.Client({
    connectionString: stripSslParams(targetUrl),
    ssl,
  });

  await source.connect();
  await target.connect();

  try {
    const tables = await listPublicTables(source);
    const targetTables = new Set(await listPublicTables(target));
    const missing = tables.filter((t) => !targetTables.has(t));
    if (missing.length > 0) {
      console.error(
        "Source tables missing on target (run prisma migrate deploy on target first):",
        missing.join(", "),
      );
      process.exit(1);
    }

    if (truncateFirst && !dryRun) {
      const list = tables.map(qIdent).join(", ");
      await target.query(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
      );
      console.log(`Truncated ${tables.length} public tables on target (except _prisma_migrations).`);
    }

    if (!dryRun) {
      await target.query(`SET session_replication_role = 'replica'`);
    }

    let total = 0;
    for (const table of tables) {
      const colsSource = await getColumnNames(source, table);
      const colsTarget = await getColumnNames(target, table);
      if (colsSource.join("\0") !== colsTarget.join("\0")) {
        console.error(
          `Column mismatch for ${table}. Source: ${colsSource.join(", ")} | Target: ${colsTarget.join(", ")}`,
        );
        process.exit(1);
      }
      const n = await copyTable(source, target, table, colsSource, dryRun);
      if (!dryRun && n > 0) console.log(`${table}: ${n} rows`);
      total += n;
    }

    if (!dryRun) {
      await target.query(`SET session_replication_role = 'origin'`);
    }

    console.log(dryRun ? `[dry-run] ${total} rows total` : `Done. ${total} rows copied.`);
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
