/** 主催・当日運用向け: sync-if-needed + refresh の間隔（秒）。環境変数で上書き可。 */
export const DEFAULT_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 30;

/** 一般閲覧向け: refresh のみの間隔（秒）。`NEXT_PUBLIC_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC` で上書き可。 */
export const DEFAULT_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC = 90;

export const MIN_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 15;

export const MAX_START_LIST_PERIODIC_SYNC_INTERVAL_SEC = 120;

function clampStartListSyncIntervalSec(sec: number): number {
  return Math.min(
    MAX_START_LIST_PERIODIC_SYNC_INTERVAL_SEC,
    Math.max(MIN_START_LIST_PERIODIC_SYNC_INTERVAL_SEC, Math.floor(sec))
  );
}

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
  return clampStartListSyncIntervalSec(base);
}

/** 一覧・一般閲覧の種目詳細: router.refresh のみのポーリング間隔 */
export function resolveStartListPublicRefreshIntervalSec(
  overrideSec?: number | null
): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC);
  const base =
    overrideSec != null && Number.isFinite(overrideSec) && overrideSec > 0
      ? overrideSec
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : DEFAULT_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC;
  return clampStartListSyncIntervalSec(base);
}
