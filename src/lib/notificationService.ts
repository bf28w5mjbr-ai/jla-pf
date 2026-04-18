import { prisma } from '@/lib/prisma';
import { sendPushNotificationToUser } from "@/lib/pushNotification";

export async function createNotification(params: {
  userId: string;
  category: 'GENERAL' | 'CLUB' | 'COMPETITION' | 'PAYMENT' | 'SYSTEM';
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  linkUrl?: string;
}) {
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

  return notification;
}

export async function createNotificationIfAbsent(params: {
  userId: string;
  category: 'GENERAL' | 'CLUB' | 'COMPETITION' | 'PAYMENT' | 'SYSTEM';
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  linkUrl?: string;
}) {
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
