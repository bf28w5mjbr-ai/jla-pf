import { jwtVerify } from "jose";

const MIN_AUTH_SECRET_LEN = 32;
const ALG = "HS256";
export const SESSION_COOKIE_NAME = "session";

function getAuthSecretBytes(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!raw || raw.length < MIN_AUTH_SECRET_LEN) {
      throw new Error(
        `AUTH_SECRET must be set and at least ${MIN_AUTH_SECRET_LEN} characters in production`
      );
    }
    return new TextEncoder().encode(raw);
  }
  const fallback =
    raw && raw.length >= MIN_AUTH_SECRET_LEN
      ? raw
      : "dev-only-auth-secret-do-not-use-in-production-32chars";
  return new TextEncoder().encode(fallback);
}

let secretCache: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (!secretCache) {
    secretCache = getAuthSecretBytes();
  }
  return secretCache;
}

/** @internal テストで AUTH_SECRET を差し替えるときにキャッシュをクリアする */
export function resetSessionEdgeSecretCacheForTests(): void {
  secretCache = null;
}

export type SessionEdgePayload = { userId: string };

/**
 * Edge / proxy 用の JWT 検証（Prisma 非依存）。
 * App Router では {@link verifySessionCached} を優先する。
 */
export async function verifySessionEdge(
  token: string
): Promise<SessionEdgePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    const userId = payload.userId;
    if (typeof userId !== "string" || !userId) return null;
    return { userId };
  } catch {
    return null;
  }
}
