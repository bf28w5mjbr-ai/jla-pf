/** スタートリスト全体の定期同期間隔（秒）。環境変数で上書き可。 */
export const DEFAULT_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 30;

export const MIN_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 15;

export const MAX_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 120;

export function resolveStartListPeriodicSyncIntervalSec(
  overrideSec?: number | null
): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_START_LIST_SYNC_INTERVAL_SEC);
  const base =
    overrideSec != null && Number.isFinite(overrideSec) && overrideSec > 0
      ? overrideSec
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : DEFAULT_START_LIST_PERIODIC_SYNC_INTERVAL_SEC;
  return Math.min(
    MAX_START_LIST_PERIODIC_SYNC_INTERVAL_SEC,
    Math.max(MIN_START_LIST_PERIODIC_SYNC_INTERVAL_SEC, Math.floor(base))
  );
}
