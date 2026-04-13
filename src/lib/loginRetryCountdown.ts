/** ログイン系レート制限の残り秒数をレスポンスから取り出す */
export function parseRetryAfterSeconds(
  res: Response,
  data: { retryAfterSec?: unknown }
): number | null {
  const raw = data.retryAfterSec;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.ceil(raw), 86400 * 7);
  }
  const h = res.headers.get("Retry-After");
  if (h) {
    const n = Number.parseInt(h, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 86400 * 7);
  }
  return null;
}

/** 再試行までの残り時間（日本語・秒単位で1秒ごと更新しやすい表記） */
export function formatJaRemainingDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}時間${m}分${String(sec).padStart(2, "0")}秒`;
  }
  if (m > 0) {
    return `${m}分${String(sec).padStart(2, "0")}秒`;
  }
  return `${sec}秒`;
}
