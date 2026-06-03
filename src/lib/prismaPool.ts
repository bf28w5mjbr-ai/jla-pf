import { Prisma } from "@prisma/client";

export function isPrismaConnectionPoolTimeout(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2024"
  );
}

/** Supabase pooler / Postgres の総接続上限（EMAXCONN 等） */
export function isPrismaMaxClientConnections(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  return (
    /EMAXCONN/i.test(message) ||
    /max client connections reached/i.test(message) ||
    /too many clients already/i.test(message)
  );
}

export function isPrismaTransactionUnavailable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028"
  );
}

export function isPrismaPoolRetryable(error: unknown): boolean {
  return (
    isPrismaConnectionPoolTimeout(error) ||
    isPrismaMaxClientConnections(error) ||
    isPrismaTransactionUnavailable(error)
  );
}

/** 当日運用の確定・一括保存など、複数クエリを伴う $transaction 向け */
export const DAY_OPS_HEAVY_TRANSACTION = {
  maxWait: 20_000,
  timeout: 55_000,
} as const;

/** 大会エントリー保存（advisory lock・種目/チームの入れ替え） */
export const COMPETITION_ENTRY_SAVE_TRANSACTION = {
  maxWait: 20_000,
  timeout: 55_000,
} as const;

/** ログイン／登録レート制限バケット（find + upsert など短い TX） */
export const LOGIN_THROTTLE_TRANSACTION = {
  maxWait: 20_000,
  timeout: 15_000,
} as const;

/** 新規登録 verify: User ネスト create + RegistrationSession 削除 */
export const REGISTRATION_CREATE_USER_TRANSACTION = {
  maxWait: 20_000,
  timeout: 30_000,
} as const;

export function prismaPoolBusyUserMessage(): string {
  return "データベースが混み合っています。しばらく待ってから再度お試しください。";
}

/**
 * 通知の Push 送信など、1 ユーザーあたり複数 DB クエリを伴う後処理の同時実行上限。
 * 本番の connection_limit（pgbouncer 時は 8）のうち、同一 HTTP リクエスト内の他処理用に余裕を残す。
 */
export function notificationDispatchConcurrency(): number {
  const fromEnv = process.env.PRISMA_NOTIFICATION_DISPATCH_CONCURRENCY;
  if (fromEnv != null && fromEnv !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return process.env.NODE_ENV === "production" ? 3 : 2;
}

function retryDelayMs(error: unknown): number {
  return isPrismaMaxClientConnections(error) ? 750 : 150;
}

/** プール枯渇（P2024）・総接続上限時に短い待機のあと1回だけ再試行する */
export async function withPrismaPoolRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isPrismaPoolRetryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error)));
    return fn();
  }
}
