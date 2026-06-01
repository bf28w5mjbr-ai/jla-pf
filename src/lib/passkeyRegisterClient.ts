"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { isPasskeyUserCancellation } from "@/lib/passkeyLoginClient";

export type PasskeyRegistrationResult =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

export async function runPasskeyRegistration(): Promise<PasskeyRegistrationResult> {
  try {
    const optionsRes = await fetch("/api/passkeys/registration/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const options = await optionsRes.json();

    if (!optionsRes.ok) {
      return {
        ok: false,
        message: options.error || "パスキー登録の初期化に失敗しました",
      };
    }

    const registrationResponse = await startRegistration(options);

    const verifyRes = await fetch("/api/passkeys/registration/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ credential: registrationResponse }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      return {
        ok: false,
        message: verifyData.error || "パスキー登録に失敗しました",
      };
    }

    return { ok: true };
  } catch (err) {
    if (isPasskeyUserCancellation(err)) {
      return { ok: false, message: "パスキー登録がキャンセルされました", cancelled: true };
    }
    console.error("Passkey registration error:", err);
    const msg = err instanceof Error ? err.message : "パスキー登録に失敗しました";
    return { ok: false, message: msg };
  }
}
