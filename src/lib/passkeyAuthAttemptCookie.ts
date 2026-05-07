import { randomUUID } from "crypto";

type PasskeyAuthAttempt = {
  id: string;
  challenge: string;
  issuedAtMs: number;
};

const MAX_STORED_ATTEMPTS = 5;
const ATTEMPT_TTL_MS = 5 * 60 * 1000;

function isPasskeyAuthAttempt(value: unknown): value is PasskeyAuthAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<PasskeyAuthAttempt>;
  return (
    typeof attempt.id === "string" &&
    attempt.id.length > 0 &&
    typeof attempt.challenge === "string" &&
    attempt.challenge.length > 0 &&
    typeof attempt.issuedAtMs === "number" &&
    Number.isFinite(attempt.issuedAtMs)
  );
}

function decodeCookieValue(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

function parseCookieAttempts(raw: string | undefined): PasskeyAuthAttempt[] {
  const decoded = decodeCookieValue(raw);
  if (!decoded) return [];
  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPasskeyAuthAttempt);
  } catch {
    return [];
  }
}

function pruneAttempts(
  attempts: PasskeyAuthAttempt[],
  nowMs: number = Date.now()
): PasskeyAuthAttempt[] {
  return attempts
    .filter((attempt) => nowMs - attempt.issuedAtMs <= ATTEMPT_TTL_MS)
    .sort((a, b) => b.issuedAtMs - a.issuedAtMs)
    .slice(0, MAX_STORED_ATTEMPTS);
}

export function issuePasskeyAuthAttempt(
  rawCookieValue: string | undefined,
  challenge: string,
  nowMs: number = Date.now()
): { attemptId: string; cookieValue: string } {
  const existing = pruneAttempts(parseCookieAttempts(rawCookieValue), nowMs);
  const attempt: PasskeyAuthAttempt = {
    id: randomUUID(),
    challenge,
    issuedAtMs: nowMs,
  };
  const next = [attempt, ...existing].slice(0, MAX_STORED_ATTEMPTS);
  return {
    attemptId: attempt.id,
    cookieValue: encodeURIComponent(JSON.stringify(next)),
  };
}

export function consumePasskeyAuthAttempt(
  rawCookieValue: string | undefined,
  attemptId: string,
  nowMs: number = Date.now()
): { challenge: string | null; cookieValue: string | null } {
  const attempts = pruneAttempts(parseCookieAttempts(rawCookieValue), nowMs);
  const matched = attempts.find((attempt) => attempt.id === attemptId) ?? null;
  const next = attempts.filter((attempt) => attempt.id !== attemptId);
  return {
    challenge: matched?.challenge ?? null,
    cookieValue: next.length > 0 ? encodeURIComponent(JSON.stringify(next)) : null,
  };
}
