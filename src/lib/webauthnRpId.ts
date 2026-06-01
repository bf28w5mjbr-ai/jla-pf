import type { NextRequest } from "next/server";

export function resolveWebAuthnRpId(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost";
  return process.env.WEBAUTHN_RP_ID ?? host.split(":")[0];
}
