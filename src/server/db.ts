// src/server/db.ts
// DB アクセスは Prisma Client の型付き API またはタグ付き $queryRaw / $executeRaw のみとし、
// 文字列連結による生 SQL（SQL インジェクション）を避ける。
import { PrismaClient } from "@prisma/client";

type PrismaGlobalState = {
  prisma: PrismaClient | undefined;
  /** dev: HMR で global.prisma が消えても TCP が残るクライアントを追跡して解放する */
  devClients?: Set<PrismaClient>;
};

const globalForPrisma = globalThis as unknown as PrismaGlobalState;

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

function withPoolQueryParams(
  url: string,
  options: {
    poolTimeout: number;
    connectionLimit: number;
    respectUrlConnectionLimit: boolean;
  }
): string {
  const { poolTimeout, connectionLimit, respectUrlConnectionLimit } = options;
  try {
    const u = new URL(url);
    const existingTimeout = u.searchParams.get("pool_timeout");
    const existingLimit = u.searchParams.get("connection_limit");
    const timeoutNum = existingTimeout != null ? Number(existingTimeout) : NaN;
    const limitNum = existingLimit != null ? Number(existingLimit) : NaN;
    if (!Number.isFinite(timeoutNum) || timeoutNum < poolTimeout) {
      u.searchParams.set("pool_timeout", String(poolTimeout));
    }
    if (respectUrlConnectionLimit) {
      if (!Number.isFinite(limitNum) || limitNum < connectionLimit) {
        u.searchParams.set("connection_limit", String(connectionLimit));
      }
    } else {
      u.searchParams.set("connection_limit", String(connectionLimit));
    }
    return u.toString();
  } catch {
    const query: string[] = [];
    if (!/[?&]pool_timeout=/.test(url)) {
      query.push(`pool_timeout=${poolTimeout}`);
    }
    if (!/[?&]connection_limit=/.test(url) || !respectUrlConnectionLimit) {
      query.push(`connection_limit=${connectionLimit}`);
    }
    if (query.length === 0) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${query.join("&")}`;
  }
}

/**
 * Next dev / プレビューでは HMR・並列 RSC で接続プールが詰まりやすい。
 * 未指定時のみ pool_timeout / connection_limit を調整する。
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 */
function withNonProdPoolTuning(url: string | undefined): string | undefined {
  if (!url || process.env.NODE_ENV === "production") return url;
  const devPoolTimeout = Number(process.env.PRISMA_DEV_POOL_TIMEOUT ?? "60");
  /**
   * 開発時は HMR・複数ワーカー・ポーリングで Prisma インスタンスと接続が積み上がりやすい。
   * Supabase の EMAXCONN（例: 200）に達しないよう、プロセスあたりの上限は低めに固定する。
   * 本番 URL をそのままコピーした場合も、既定では dev 上限で上書きする（`PRISMA_DEV_RESPECT_URL_CONNECTION_LIMIT=1` で無効化）。
   */
  const defaultLimit = /[?&]pgbouncer=true/.test(url) ? 1 : 5;
  const devConnectionLimit = Number(
    process.env.PRISMA_DEV_CONNECTION_LIMIT ?? String(defaultLimit)
  );
  return withPoolQueryParams(url, {
    poolTimeout: devPoolTimeout,
    connectionLimit: devConnectionLimit,
    respectUrlConnectionLimit:
      process.env.PRISMA_DEV_RESPECT_URL_CONNECTION_LIMIT === "1",
  });
}

/**
 * 本番（Vercel 等）向け。`DATABASE_URL` に pool パラメータが無い／低いときだけ引き上げる。
 * Vercel の Environment Variables で `PRISMA_CONNECTION_LIMIT` / `PRISMA_POOL_TIMEOUT` を上書き可能。
 */
function withProdPoolTuning(url: string | undefined): string | undefined {
  if (!url || process.env.NODE_ENV !== "production") return url;
  const prodPoolTimeout = Number(process.env.PRISMA_POOL_TIMEOUT ?? "20");
  const defaultLimit = /[?&]pgbouncer=true/.test(url) ? 8 : 5;
  const prodConnectionLimit = Number(
    process.env.PRISMA_CONNECTION_LIMIT ?? String(defaultLimit)
  );
  return withPoolQueryParams(url, {
    poolTimeout: prodPoolTimeout,
    connectionLimit: prodConnectionLimit,
    respectUrlConnectionLimit: true,
  });
}

/**
 * `tsx` 等の短命 CLI 用。Transaction pooler（6543）に TCP で届かない環境では、
 * Supabase ダッシュボードの **Direct connection**（`db.*.supabase.co:5432`）を `DATABASE_URL_UNPOOLED` に設定すると接続しやすい。
 */
export function datasourceUrlForScripts(): string | undefined {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  const raw = unpooled
    ? unpooled
    : withPoolTuning(withSupabaseTransactionPooler(process.env.DATABASE_URL));
  return withSupabaseSslModeDefault(raw);
}

function withPoolTuning(url: string | undefined): string | undefined {
  return withProdPoolTuning(withNonProdPoolTuning(url));
}

const datasourceUrl = withSupabaseSslModeDefault(
  withPoolTuning(withSupabaseTransactionPooler(process.env.DATABASE_URL))
);

function trackDevPrismaClient(client: PrismaClient): void {
  if (process.env.NODE_ENV === "production") return;
  if (!globalForPrisma.devClients) globalForPrisma.devClients = new Set();
  globalForPrisma.devClients.add(client);
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });
  trackDevPrismaClient(client);
  return client;
}

async function disconnectDevPrismaClients(except?: PrismaClient): Promise<void> {
  const clients = globalForPrisma.devClients;
  if (!clients?.size) return;
  const pending = [...clients]
    .filter((c) => c !== except)
    .map(async (c) => {
      clients.delete(c);
      await c.$disconnect();
    });
  await Promise.allSettled(pending);
}

function getOrCreatePrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  if (process.env.NODE_ENV !== "production") {
    // HMR で singleton 参照だけ消えた古いクライアントの接続を先に閉じる
    void disconnectDevPrismaClients();
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getOrCreatePrismaClient();

/** dev サーバー終了時に接続を解放（HMR 再起動で EMAXCONN が積み上がるのを抑える） */
export async function disconnectPrismaForDevShutdown(): Promise<void> {
  globalForPrisma.prisma = undefined;
  await disconnectDevPrismaClients();
}
