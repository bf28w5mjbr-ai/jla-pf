/**
 * 当日運用 API の計測用（Server-Timing ヘッダ・クライアントログ）。
 * `DAY_OPS_SERVER_TIMING=1` でレスポンスに `Server-Timing` を付与する。
 */

export function dayOpsServerTimingEnabled(): boolean {
  return process.env.DAY_OPS_SERVER_TIMING === "1";
}

/** RFC 6797 Server-Timing 値（例: `db;dur=12, build;dur=3`） */
export function formatDayOpsServerTiming(parts: { name: string; durMs: number }[]): string {
  return parts
    .map((p) => `${p.name};dur=${Math.max(0, Math.round(p.durMs))}`)
    .join(", ");
}

export function dayOpsClientMetricsEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_DAY_OPS_METRICS === "1";
}

export function measureDayOpsAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (typeof performance === "undefined" || !dayOpsClientMetricsEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  return fn().finally(() => {
    console.info(`[day-ops-metrics] ${label} ${(performance.now() - t0).toFixed(1)}ms`);
  });
}
