import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { resolveWebAuthnRpId } from "@/lib/webauthnRpId";

function mockRequest(host: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name === "host" ? host : null),
    },
  } as NextRequest;
}

describe("resolveWebAuthnRpId", () => {
  it("WEBAUTHN_RP_ID が設定されていればそれを使う", () => {
    process.env.WEBAUTHN_RP_ID = "bluvium.jp";
    expect(resolveWebAuthnRpId(mockRequest("localhost:3000"))).toBe("bluvium.jp");
    delete process.env.WEBAUTHN_RP_ID;
  });

  it("未設定時は Host ヘッダーから RP ID を解決", () => {
    delete process.env.WEBAUTHN_RP_ID;
    expect(resolveWebAuthnRpId(mockRequest("bluvium.jp"))).toBe("bluvium.jp");
    expect(resolveWebAuthnRpId(mockRequest("localhost:3000"))).toBe("localhost");
  });
});
