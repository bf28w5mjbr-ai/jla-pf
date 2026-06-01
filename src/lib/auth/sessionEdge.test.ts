import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetSessionEdgeSecretCacheForTests,
  SESSION_COOKIE_NAME,
  verifySessionEdge,
} from "@/lib/auth/sessionEdge";

const DEV_SECRET = new TextEncoder().encode(
  "dev-only-auth-secret-do-not-use-in-production-32chars"
);

async function signTestToken(
  payload: { userId: string },
  expiresInSec: number
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(DEV_SECRET);
}

describe("verifySessionEdge", () => {
  const prevAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (prevAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = prevAuthSecret;
    }
    resetSessionEdgeSecretCacheForTests();
  });

  it("有効な JWT から userId を返す", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestToken({ userId: "user-1" }, 60);
    await expect(verifySessionEdge(token)).resolves.toEqual({ userId: "user-1" });
  });

  it("期限切れ JWT は null", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestToken({ userId: "user-1" }, -1);
    await expect(verifySessionEdge(token)).resolves.toBeNull();
  });

  it("改ざん JWT は null", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestToken({ userId: "user-1" }, 60);
    await expect(verifySessionEdge(`${token}x`)).resolves.toBeNull();
  });

  it("SESSION_COOKIE_NAME は session", () => {
    expect(SESSION_COOKIE_NAME).toBe("session");
  });
});
