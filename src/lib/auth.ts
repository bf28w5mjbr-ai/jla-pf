import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/server/db";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
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

export async function isPfOrJlaAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "PF_ADMIN" || String(user?.role) === "JLA_ADMIN";
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
