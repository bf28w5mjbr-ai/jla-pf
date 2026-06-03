import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import {
  notificationDispatchConcurrency,
  withPrismaPoolRetryOnce,
} from "@/lib/prismaPool";
import { sendPushNotificationToUser } from "@/lib/pushNotification";
import { sendNotificationEmail } from "@/lib/email/sendNotificationEmail";

type NotificationCategory = "GENERAL" | "CLUB" | "COMPETITION" | "PAYMENT" | "SYSTEM";

type CreateNotificationParams = {
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  linkUrl?: string;
  sendEmail?: boolean;
};

async function dispatchNotificationEmail(params: CreateNotificationParams): Promise<void> {
  if (!params.sendEmail) return;
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { email: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return;
  await sendNotificationEmail({
    to: user.email,
    title: params.title,
    body: params.body,
    linkUrl: params.linkUrl,
  });
}

export async function createNotification(params: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      category: params.category,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedId: params.relatedId,
      linkUrl: params.linkUrl,
      read: false,
    },
  });

  // DB保存を優先し、Push送信失敗では処理全体を失敗させない
  void sendPushNotificationToUser({
    userId: params.userId,
    title: params.title,
    body: params.body,
    linkUrl: params.linkUrl,
  }).catch((error) => {
    console.error("Push notification send error:", error);
  });

  // メール送信は補助チャネル。失敗しても通知作成自体は成功扱いとする。
  void dispatchNotificationEmail(params).catch((error) => {
    console.error("Notification email send error:", error);
  });

  return notification;
}

const BROADCAST_CREATE_MANY_CHUNK = 200;

export type BroadcastNotificationParams = Omit<CreateNotificationParams, "userId"> & {
  userIds: string[];
};

/**
 * 管理者一斉通知向け。createMany でバッチ INSERT し、Push はプールに合わせた並列数で非同期送信する。
 */
export async function createBroadcastNotifications(
  params: BroadcastNotificationParams
): Promise<{ successCount: number; failureCount: number }> {
  const { userIds, ...notification } = params;
  if (userIds.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;

  for (let offset = 0; offset < userIds.length; offset += BROADCAST_CREATE_MANY_CHUNK) {
    const chunk = userIds.slice(offset, offset + BROADCAST_CREATE_MANY_CHUNK);
    try {
      await withPrismaPoolRetryOnce(() =>
        prisma.notification.createMany({
          data: chunk.map((userId) => ({
            userId,
            category: notification.category,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            relatedId: notification.relatedId,
            linkUrl: notification.linkUrl,
            read: false,
          })),
        })
      );
      successCount += chunk.length;
    } catch (error) {
      console.error("broadcast notification createMany error", error);
      failureCount += chunk.length;
    }
  }

  void dispatchBroadcastPushNotifications(userIds, {
    title: notification.title,
    body: notification.body,
    linkUrl: notification.linkUrl,
  });

  return { successCount, failureCount };
}

function dispatchBroadcastPushNotifications(
  userIds: string[],
  payload: { title: string; body: string; linkUrl?: string }
): void {
  const limit = notificationDispatchConcurrency();
  void mapWithConcurrency(userIds, limit, async (userId) => {
    try {
      await sendPushNotificationToUser({
        userId,
        title: payload.title,
        body: payload.body,
        linkUrl: payload.linkUrl,
      });
    } catch (error) {
      console.error("Push notification send error:", error);
    }
  }).catch((error) => {
    console.error("broadcast push dispatch error", error);
  });
}

export async function createNotificationIfAbsent(params: CreateNotificationParams) {
  if (!params.relatedId) {
    return createNotification(params);
  }

  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      type: params.type,
      relatedId: params.relatedId,
    },
    select: { id: true },
  });

  if (existing) {
    return null;
  }

  return createNotification(params);
}
