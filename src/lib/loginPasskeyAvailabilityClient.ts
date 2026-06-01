const LOGIN_EMAIL_MAX_LEN = 320;

/** ログイン画面向けの簡易メール形式チェック（API 呼び出し前） */
export function isLoginEmailFormatValid(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > LOGIN_EMAIL_MAX_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * サーバー上にパスキーがあるアカウントか（ログインボタン表示用）。
 * @returns true/false = 判定済み、null = 取得失敗・429 等（ボタン非表示のまま）
 */
export async function fetchPasskeyLoginOffered(
  rawEmail: string,
  signal?: AbortSignal
): Promise<boolean | null> {
  if (!isLoginEmailFormatValid(rawEmail)) {
    return false;
  }

  const email = normalizeLoginEmail(rawEmail);

  try {
    const res = await fetch("/api/auth/login/passkey-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
      signal,
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { passkeyLoginOffered?: unknown };
    return data.passkeyLoginOffered === true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    return null;
  }
}
