import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/server/db";

const MIN_AUTH_SECRET_LEN = 32;

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

/** セッション以外の短命 JWT（当日運用アンロック等）でも同一鍵を使用する */
export function getJwtSecretKeyBytes(): Uint8Array {
  return getSecret();
}

const ALG = "HS256";

// セッション有効期限: 30日間（ユーザーに再ログインの手間をかけない）
const DEFAULT_SESSION_DURATION = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = { userId: string };

export async function signSession(payload: SessionPayload, maxAgeSec = DEFAULT_SESSION_DURATION) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * App Router の同一リクエスト内で、レイアウトとページが二重に JWT 検証しないためのメモ化。
 * API Route や middleware では従来どおり {@link verifySession} を使う。
 */
export const verifySessionCached = cache(
  async (token: string | null | undefined): Promise<SessionPayload | null> => {
    if (!token) return null;
    return verifySession(token);
  }
);

/**
 * `(authenticated)` 配下のページ用。同一リクエスト内は {@link verifySessionCached} と合わせてメモ化される。
 */
export const getRequiredAuthenticatedUserId = cache(async (): Promise<string> => {
  const token = (await cookies()).get("session")?.value;
  const session = await verifySessionCached(token);
  if (!session?.userId) redirect("/login");
  return session.userId;
});

/** メタデータ等: 未ログインでもよいときの userId（リクエスト内メモ化） */
export const getOptionalAuthenticatedUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get("session")?.value;
  const session = await verifySessionCached(token);
  return session?.userId ?? null;
});

export async function isAssociationAdmin(userId: string): Promise<boolean> {
  const associationAdmin = await prisma.associationAdmin.findFirst({
    where: {
      userId,
      role: "ADMIN",
    },
    select: { id: true },
  });
  return !!associationAdmin;
}

export async function isPfOrAccAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "PF_ADMIN") {
    return true;
  }
  return isAssociationAdmin(userId);
}

// backward compatibility alias
export async function isPfOrJlaAdmin(userId: string): Promise<boolean> {
  return isPfOrAccAdmin(userId);
}

export async function requireAuth(token: string | undefined): Promise<SessionPayload> {
  if (!token) {
    throw new Error("Unauthorized");
  }
  const session = await verifySession(token);
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
