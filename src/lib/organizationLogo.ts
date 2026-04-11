/** 主催団体ロゴURLの検証（URL入力・API共通） */
export function isValidOrganizationLogoUrl(raw: string): boolean {
  const url = raw.trim();
  if (!url || url.length > 2048) return false;
  if (url.startsWith("//") || url.includes(" ") || url.includes("\n")) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      const h = parsed.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    }
    return false;
  } catch {
    return false;
  }
}

/** ロゴなし時のプレースホルダ用（先頭1〜2文字） */
export function organizationNameInitials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const chars = [...t];
  if (chars.length >= 2) return `${chars[0]}${chars[1]}`;
  return chars[0] ?? "?";
}
