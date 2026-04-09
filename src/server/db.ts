// src/server/db.ts
// DB アクセスは Prisma Client の型付き API またはタグ付き $queryRaw / $executeRaw のみとし、
// 文字列連結による生 SQL（SQL インジェクション）を避ける。
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Next dev / プレビューでは HMR・並列 RSC で接続プールが詰まりやすい。
 * 未指定時のみ pool_timeout / connection_limit を調整する。
 * 本番は DATABASE_URL をそのまま使う。
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 */
function withNonProdPoolTuning(url: string | undefined): string | undefined {
  if (!url || process.env.NODE_ENV === "production") return url;
  const devPoolTimeout = process.env.PRISMA_DEV_POOL_TIMEOUT ?? "60";
  /**
   * 開発時はポーリングや並列RSCで同時接続が増えやすいので、
   * 既定値を 5 -> 10 に引き上げる（環境変数で上書き可能）。
   */
  const devConnectionLimit = process.env.PRISMA_DEV_CONNECTION_LIMIT ?? "10";
  const hasPoolTimeout = /[?&]pool_timeout=/.test(url);
  const hasConnectionLimit = /[?&]connection_limit=/.test(url);
  if (hasPoolTimeout && hasConnectionLimit) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", devPoolTimeout);
    }
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", devConnectionLimit);
    }
    return u.toString();
  } catch {
    const query = [];
    if (!hasPoolTimeout) query.push(`pool_timeout=${devPoolTimeout}`);
    if (!hasConnectionLimit) query.push(`connection_limit=${devConnectionLimit}`);
    if (query.length === 0) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${query.join("&")}`;
  }
}

const datasourceUrl = withNonProdPoolTuning(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
