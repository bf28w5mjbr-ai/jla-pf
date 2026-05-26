import { Prisma } from "@prisma/client";

export function isPrismaConnectionPoolTimeout(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2024"
  );
}

/** プール枯渇（P2024）時に短い待機のあと1回だけ再試行する */
export async function withPrismaPoolRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isPrismaConnectionPoolTimeout(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return fn();
  }
}
