/**
 * 画面・監査ログ用の IP / User-Agent 表示（完全値は出さない）
 * サーバの console には `@/lib/safeServerErrorLog` を使い、例外オブジェクトをそのまま出さないこと。
 */
export function maskIpForDisplay(ip: string | null | undefined): string {
  if (!ip || ip === "unknown") return "—";
  if (ip.includes(".")) {
    const p = ip.split(".");
    if (p.length === 4) return `${p[0]}.${p[1]}.*.*`;
  }
  if (ip.includes(":")) {
    return ip.slice(0, 12) + "…";
  }
  return ip.slice(0, 16) + (ip.length > 16 ? "…" : "");
}

export function truncateUserAgent(
  ua: string | null | undefined,
  max = 120
): string {
  if (!ua) return "—";
  const t = ua.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}
