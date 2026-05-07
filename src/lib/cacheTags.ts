/** {@link unstable_cache} / {@link revalidateTag} で未読通知件数キャッシュを無効化するときに使う */
export function notificationUnreadCountTag(userId: string): string {
  return `notification-unread-count-${userId}`;
}
