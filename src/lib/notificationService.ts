import { prisma } from "@/lib/prisma";
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
