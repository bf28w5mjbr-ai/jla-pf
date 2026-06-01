import type { NextRequest } from "next/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

export function resolveWebAuthnRpId(req: NextRequest): string {
  const configured = process.env.WEBAUTHN_RP_ID?.trim();
  if (configured) return configured;

  const host = req.headers.get("host") ?? "localhost";
  const hostname = host.split(":")[0]!.toLowerCase();
  if (hostname.startsWith("www.")) {
    return hostname.slice(4);
  }
  return hostname;
}

/** assertion の id / rawId から DB 照合用 Buffer を得る（rawId を優先） */
export function credentialIdBufferFromAssertion(credential: unknown): Buffer | null {
  if (!credential || typeof credential !== "object") return null;
  const { rawId, id } = credential as { rawId?: unknown; id?: unknown };
  for (const value of [rawId, id]) {
    if (typeof value !== "string" || !value) continue;
    try {
      return Buffer.from(isoBase64URL.toBuffer(value));
    } catch {
      continue;
    }
  }
  return null;
}
