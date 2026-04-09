import type { NextRequest } from "next/server";

/**
 * X-Forwarded-For / X-Real-IP はクライアントが偽装可能なため、
 * 信頼できるリバースプロキシの前に置く場合のみ有効にする。
 * - Vercel: VERCEL=1 が自動で付与される
 * - 自前ホスト: TRUST_PROXY_HEADERS=true を明示
 */
function trustForwardedHeaders(): boolean {
  if (process.env.TRUST_PROXY_HEADERS === "true") return true;
  if (process.env.TRUST_PROXY_HEADERS === "false") return false;
  return process.env.VERCEL === "1";
}

/**
 * リバースプロキシ経由のクライアント IP（信頼時のみ X-Forwarded-For 先頭を使用）。
 * 不正ログイン対策のレート制限キーに使用する。
 */
export function getTrustedClientIp(req: NextRequest): string {
  if (trustForwardedHeaders()) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first.slice(0, 64);
    }
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp.slice(0, 64);
  }
  return "unknown";
}

/**
 * 環境変数 BLOCKED_LOGIN_IPS（カンマ区切り）に含まれる IP からのログインを拒否する。
 */
export function isLoginIpBlocklisted(ip: string): boolean {
  const raw = process.env.BLOCKED_LOGIN_IPS?.trim();
  if (!raw) return false;
  const blocked = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return blocked.has(ip);
}
