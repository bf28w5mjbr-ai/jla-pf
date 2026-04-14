import { createHash, randomBytes } from "crypto";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
