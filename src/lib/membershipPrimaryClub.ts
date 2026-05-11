/**
 * メンバーシップ削除時、User の主所属クラブが同じ club のとき primary を外す必要がある。
 */
export function shouldClearPrimaryClubAfterMembershipDelete(
  userPrimaryClubId: string | null | undefined,
  membershipClubId: string
): boolean {
  return userPrimaryClubId != null && userPrimaryClubId === membershipClubId;
}
