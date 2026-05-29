/** {@link unstable_cache} / {@link revalidateTag} で未読通知件数キャッシュを無効化するときに使う */
export function notificationUnreadCountTag(userId: string): string {
  return `notification-unread-count-${userId}`;
}

/** 公開大会ページの匿名向けデータキャッシュ */
export function competitionPublicPageTag(competitionId: string): string {
  return `competition-public-${competitionId}`;
}
