/** クラブ参加申請を申請時点で即時承認する（一時運用向け）。本番では通常未設定または false。 */
export function isMembershipAutoApproveEnabled(): boolean {
  return process.env.MEMBERSHIP_AUTO_APPROVE === "true";
}
