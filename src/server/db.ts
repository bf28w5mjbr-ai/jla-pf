// src/server/db.ts
// DB アクセスは Prisma Client の型付き API またはタグ付き $queryRaw / $executeRaw のみとし、
// 文字列連結による生 SQL（SQL インジェクション）を避ける。
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Supabase Transaction pooler（pgbouncer）経由では、同一接続以外で
 * prepared statement 名が再利用され 42P05 "already exists" になる。
 * Prisma は `pgbouncer=true` でプリペアドを使わない挙動になる。
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
 */
/** 外向き Postgres（特に Supabase）で TLS が必須のとき、未指定なら `sslmode=require` を付与する */
export function withSupabaseSslModeDefault(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("supabase.co")) return url;
    if (u.searchParams.has("sslmode")) return url;
    u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return url;
  }
}

function withSupabaseTransactionPooler(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]pgbouncer=true(?:&|$)/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("pooler.supabase.com")) return url;
    const port = u.port || "5432";
    if (port !== "6543") return url;
    u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Next dev / プレビューでは HMR・並列 RSC で接続プールが詰まりやすい。
 * 未指定時のみ pool_timeout / connection_limit を調整する。
 * 本番は DATABASE_URL をそのまま使う。
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 */
function withNonProdPoolTuning(url: string | undefined): string | undefined {
  if (!url || process.env.NODE_ENV === "production") return url;
  const devPoolTimeout = Number(process.env.PRISMA_DEV_POOL_TIMEOUT ?? "60");
  /**
   * 開発時はポーリング・並列 RSC・$transaction 併用で同時接続が増えやすい。
   * pgbouncer 経由でも Prisma クライアント側の上限を少し上げる（環境変数で上書き可）。
   */
  const defaultLimit = /[?&]pgbouncer=true/.test(url) ? 8 : 10;
  const devConnectionLimit = Number(
    process.env.PRISMA_DEV_CONNECTION_LIMIT ?? String(defaultLimit)
  );
  try {
    const u = new URL(url);
    const existingTimeout = u.searchParams.get("pool_timeout");
    const existingLimit = u.searchParams.get("connection_limit");
    const timeoutNum = existingTimeout != null ? Number(existingTimeout) : NaN;
    const limitNum = existingLimit != null ? Number(existingLimit) : NaN;
    if (!Number.isFinite(timeoutNum) || timeoutNum < devPoolTimeout) {
      u.searchParams.set("pool_timeout", String(devPoolTimeout));
    }
    if (!Number.isFinite(limitNum) || limitNum < devConnectionLimit) {
      u.searchParams.set("connection_limit", String(devConnectionLimit));
    }
    return u.toString();
  } catch {
    const query: string[] = [];
    if (!/[?&]pool_timeout=/.test(url)) {
      query.push(`pool_timeout=${devPoolTimeout}`);
    }
    if (!/[?&]connection_limit=/.test(url)) {
      query.push(`connection_limit=${devConnectionLimit}`);
    }
    if (query.length === 0) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${query.join("&")}`;
  }
}

/**
 * `tsx` 等の短命 CLI 用。Transaction pooler（6543）に TCP で届かない環境では、
 * Supabase ダッシュボードの **Direct connection**（`db.*.supabase.co:5432`）を `DATABASE_URL_UNPOOLED` に設定すると接続しやすい。
 */
export function datasourceUrlForScripts(): string | undefined {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  const raw = unpooled
    ? unpooled
    : withNonProdPoolTuning(withSupabaseTransactionPooler(process.env.DATABASE_URL));
  return withSupabaseSslModeDefault(raw);
}

const datasourceUrl = withSupabaseSslModeDefault(
  withNonProdPoolTuning(withSupabaseTransactionPooler(process.env.DATABASE_URL))
);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
