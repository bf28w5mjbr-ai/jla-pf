/** 当日運用 Cookie 設定直後〜RSC 再検証までの UI 用（認可の本体は httpOnly Cookie） */

function storageKey(competitionId: string): string {
  return `jla:dayops:unlocked:v1:${competitionId}`;
}

export function markDayOpsUnlockedClient(competitionId: string): void {
  try {
    sessionStorage.setItem(storageKey(competitionId), "1");
  } catch {
    /* private mode 等 */
  }
}

export function isDayOpsUnlockedClientHint(competitionId: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(competitionId)) === "1";
  } catch {
    return false;
  }
}

export function clearDayOpsUnlockedClient(competitionId: string): void {
  try {
    sessionStorage.removeItem(storageKey(competitionId));
  } catch {
    /* ignore */
  }
}
