/**
 * ログイン成功後の遷移先。オープンリダイレクト対策のため同一オリジンの相対パスのみ許可。
 */
export function safePostLoginPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (t === "") return null;
  if (!t.startsWith("/")) return null;
  if (t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  if (t.includes("\\")) return null;
  return t;
}

export function appendRedirectQuery(basePath: string, redirect: string | null): string {
  const safe = safePostLoginPath(redirect);
  if (!safe) return basePath;
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}redirect=${encodeURIComponent(safe)}`;
}
