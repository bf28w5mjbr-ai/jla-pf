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

const secret = getAuthSecretBytes();
const ALG = "HS256";

// セッション有効期限: 30日間（ユーザーに再ログインの手間をかけない）
const DEFAULT_SESSION_DURATION = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = { userId: string };

export async function signSession(payload: SessionPayload, maxAgeSec = DEFAULT_SESSION_DURATION) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

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
