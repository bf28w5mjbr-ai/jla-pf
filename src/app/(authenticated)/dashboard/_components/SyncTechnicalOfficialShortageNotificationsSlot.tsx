import { syncTechnicalOfficialShortageNotificationsForUser } from "@/lib/technicalOfficialShortageNotification";

/** ダッシュボード表示時に TO 不足を通知へ同期（UI は出さない） */
export async function SyncTechnicalOfficialShortageNotificationsSlot({
  userId,
}: {
  userId: string;
}) {
  await syncTechnicalOfficialShortageNotificationsForUser(userId);
  return null;
}
