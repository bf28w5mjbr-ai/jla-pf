/**
 * ユーザー入力の URL を http(s) のみに制限し、href 等での XSS（javascript: 等）を防ぐ。
 * 空・空白のみは null。スキーム省略時は https を補う。
 */
export function normalizeOptionalHttpUrl(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = tryParseHttpUrl(trimmed);
  if (!parsed) return null;

  if (parsed.username || parsed.password) {
    return null;
  }

  return parsed.href;
}

function tryParseHttpUrl(trimmed: string): URL | null {
  const attempts = [trimmed, `https://${trimmed}`];
  for (const candidate of attempts) {
    try {
      const u = new URL(candidate);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** API 用: unknown フィールドを検証し、不正ならエラーメッセージを返す */
export function parseOptionalWebsiteUrlField(value: unknown):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      error: "ウェブサイトURLの形式が正しくありません",
    };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  const normalized = normalizeOptionalHttpUrl(trimmed);
  if (normalized === null) {
    return {
      ok: false,
      error: "ウェブサイトURLは http または https のURLのみ指定できます",
    };
  }
  return { ok: true, value: normalized };
}
