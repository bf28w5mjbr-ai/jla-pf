import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const ALG = "HS256";

export type SessionPayload = { userId: string };

export async function signSession(payload: SessionPayload, maxAgeSec = 60 * 60 * 24 * 7) {
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
