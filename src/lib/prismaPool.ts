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

export function isPrismaPoolRetryable(error: unknown): boolean {
  return (
    isPrismaConnectionPoolTimeout(error) || isPrismaMaxClientConnections(error)
  );
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
