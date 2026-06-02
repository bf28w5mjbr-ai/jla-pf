/**
 * チーム構成員の状態を1つの表示状態へ畳み込む。
 * 優先順位: DSQ > DNF > DNS/WITHDRAWN > 全員CALLED(or CHECKED_IN) > PENDING
 */
export function foldTeamMemberStatuses(statuses: readonly string[]): string {
  if (statuses.length === 0) return "PENDING";
  if (statuses.some((s) => s === "DSQ")) return "DSQ";
  if (statuses.some((s) => s === "DNF")) return "DNF";
  if (statuses.some((s) => s === "WITHDRAWN")) return "WITHDRAWN";
  if (statuses.some((s) => s === "DNS")) return "DNS";
  if (statuses.every((s) => s === "CALLED" || s === "CHECKED_IN")) return "CALLED";
  return "PENDING";
}

export function isCalledLikeStatus(status: string): boolean {
  return status === "CALLED" || status === "CHECKED_IN";
}

/**
 * リザルト入力可否や召集済み人数カウント用。
 * CHECKED_IN を含め、全員が「召集済み相当」のとき true。
 */
export function isTeamFullyCalled(statuses: readonly string[]): boolean {
  return statuses.length > 0 && statuses.every((s) => isCalledLikeStatus(s));
}
