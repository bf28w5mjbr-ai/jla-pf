"use client";

import { startAuthentication, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { parseRetryAfterSeconds } from "@/lib/loginRetryCountdown";

export type PasskeyLoginOptionsRequest = {
  email?: string;
  useBrowserAutofill?: boolean;
};

export type PasskeyLoginResult =
  | { ok: true }
  | { ok: false; kind: "rate_limited"; retryAfterSec: number }
  | { ok: false; kind: "error"; message: string };

type PublicKeyCredentialRequestOptionsJSON = Parameters<typeof startAuthentication>[0];

function stripAttemptId(
  options: PublicKeyCredentialRequestOptionsJSON & { attemptId?: string }
): PublicKeyCredentialRequestOptionsJSON {
  const { attemptId: _attemptId, ...webAuthnOptions } = options;
  return webAuthnOptions;
}

export async function runPasskeyLoginFlow(
  request: PasskeyLoginOptionsRequest
): Promise<PasskeyLoginResult> {
  const optionsRes = await fetch("/api/passkeys/authentication/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      request.email ? { email: request.email } : {}
    ),
  });

  const options = (await optionsRes.json()) as PublicKeyCredentialRequestOptionsJSON & {
    attemptId?: string;
    error?: string;
    retryAfterSec?: unknown;
  };

  if (!optionsRes.ok) {
    if (optionsRes.status === 429) {
      const sec = parseRetryAfterSeconds(optionsRes, options);
      if (sec != null) {
        return { ok: false, kind: "rate_limited", retryAfterSec: sec };
      }
    }
    return {
      ok: false,
      kind: "error",
      message: options.error ?? "パスキー認証を開始できませんでした",
    };
  }

  const attemptId = typeof options.attemptId === "string" ? options.attemptId : null;
  if (!attemptId) {
    return {
      ok: false,
      kind: "error",
      message: "パスキー認証の準備に失敗しました。もう一度お試しください",
    };
  }

  const webAuthnOptions = stripAttemptId(options);
  const assertion = await startAuthentication(
    webAuthnOptions,
    request.useBrowserAutofill === true
  );

  const verifyRes = await fetch("/api/passkeys/authentication/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: assertion, attemptId }),
  });

  const verifyData = (await verifyRes.json()) as { error?: string; retryAfterSec?: unknown };

  if (!verifyRes.ok) {
    if (verifyRes.status === 429) {
      const sec = parseRetryAfterSeconds(verifyRes, verifyData);
      if (sec != null) {
        return { ok: false, kind: "rate_limited", retryAfterSec: sec };
      }
    }
    return {
      ok: false,
      kind: "error",
      message: verifyData.error ?? "パスキー認証に失敗しました。もう一度最初からお試しください",
    };
  }

  return { ok: true };
}

export async function supportsPasskeyAutofill(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

export function isPasskeyUserCancellation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name;
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    err.message.includes("The operation either timed out or was not allowed")
  );
}
