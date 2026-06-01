/** @vitest-environment node */
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { tryEarlyAuthenticatedRedirect } from "@/lib/auth/earlyAuthenticatedRedirect";
import {
  resetSessionEdgeSecretCacheForTests,
  verifySessionEdge,
} from "@/lib/auth/sessionEdge";

const DEV_SECRET = new TextEncoder().encode(
  "dev-only-auth-secret-do-not-use-in-production-32chars"
);

async function signTestSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3600s")
    .sign(DEV_SECRET);
}

function request(url: string, cookie?: string): NextRequest {
  const parsed = new URL(url);
  const headers = new Headers();
  headers.set("host", parsed.host);
  if (cookie) headers.set("Cookie", `session=${cookie}`);
  return new NextRequest(parsed, { headers });
}

describe("tryEarlyAuthenticatedRedirect", () => {
  const prevAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (prevAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = prevAuthSecret;
    }
    resetSessionEdgeSecretCacheForTests();
  });

  it("カバーホストで有効 session の / は /dashboard へ rewrite", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestSession("u1");
    const req = request("https://bluvium.jp/", token);
    await expect(verifySessionEdge(token)).resolves.toEqual({ userId: "u1" });
    const res = await tryEarlyAuthenticatedRedirect(req);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("x-middleware-rewrite")).toBe("https://bluvium.jp/dashboard");
  });

  it("未ログインは null", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const res = await tryEarlyAuthenticatedRedirect(request("https://bluvium.jp/"));
    expect(res).toBeNull();
  });

  it("/login は safe redirect 先へ", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestSession("u1");
    const res = await tryEarlyAuthenticatedRedirect(
      request("https://bluvium.jp/login?redirect=%2Fsettings", token)
    );
    expect(res?.headers.get("location")).toBe("https://bluvium.jp/settings");
  });

  it("非カバーホストは null", async () => {
    delete process.env.AUTH_SECRET;
    resetSessionEdgeSecretCacheForTests();
    const token = await signTestSession("u1");
    const res = await tryEarlyAuthenticatedRedirect(
      request("https://other.example/", token)
    );
    expect(res).toBeNull();
  });
});
