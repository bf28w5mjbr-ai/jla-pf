import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import {
  notificationDispatchConcurrency,
  withPrismaPoolRetryOnce,
} from "@/lib/prismaPool";
import { sendPushNotificationToUser } from "@/lib/pushNotification";
import { sendNotificationEmail } from "@/lib/email/sendNotificationEmail";
import { isResendOnboardingFrom, resolveTransactionalEmailFrom } from "@/lib/email/resendRegistrationOtp";

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
/** Resend のレート制限を避ける（未払い出場意思メールと同じ間隔） */
const BROADCAST_EMAIL_SEND_INTERVAL_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export type BroadcastNotificationParams = Omit<CreateNotificationParams, "userId"> & {
  userIds: string[];
  /** 既定 true。メールは DB 作成後に非同期で順次送信する。 */
  sendEmail?: boolean;
};

/**
 * 一斉通知のメール送信（Resend）。API 応答後もバックグラウンドで完了を目指す。
 */
export async function runBroadcastEmailDispatch(
  userIds: string[],
  payload: { title: string; body: string; linkUrl?: string }
): Promise<{ sentCount: number; failedCount: number; skippedCount: number }> {
  if (userIds.length === 0) {
    return { sentCount: 0, failedCount: 0, skippedCount: 0 };
  }
  if (!isResendConfigured()) {
    console.warn("broadcast email: RESEND_API_KEY が未設定のためスキップ");
    return { sentCount: 0, failedCount: 0, skippedCount: userIds.length };
  }
  const from = resolveTransactionalEmailFrom();
  if (isResendOnboardingFrom(from)) {
    console.warn(
      "broadcast email: 検証済みドメインの EMAIL_FROM が未設定のためスキップ（onboarding@resend.dev は一斉送信不可）"
    );
    return { sentCount: 0, failedCount: 0, skippedCount: userIds.length };
  }

  const recipients: { userId: string; email: string }[] = [];
  for (let offset = 0; offset < userIds.length; offset += BROADCAST_CREATE_MANY_CHUNK) {
    const chunk = userIds.slice(offset, offset + BROADCAST_CREATE_MANY_CHUNK);
    const users = await prisma.user.findMany({
      where: { id: { in: chunk }, deletedAt: null },
      select: { id: true, email: true },
    });
    for (const user of users) {
      const email = user.email?.trim();
      if (email) recipients.push({ userId: user.id, email });
    }
  }

  const skippedCount = userIds.length - recipients.length;
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await sleep(BROADCAST_EMAIL_SEND_INTERVAL_MS);
    const recipient = recipients[i]!;
    try {
      await sendNotificationEmail({
        to: recipient.email,
        title: payload.title,
        body: payload.body,
        linkUrl: payload.linkUrl,
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("broadcast email send error", {
        userId: recipient.userId,
        error,
      });
    }
  }

  return { sentCount, failedCount, skippedCount };
}

/**
 * 管理者一斉通知向け。createMany でバッチ INSERT し、Push / メールはプール・レート制限に合わせて非同期送信する。
 */
export async function createBroadcastNotifications(
  params: BroadcastNotificationParams
): Promise<{ successCount: number; failureCount: number }> {
  const { userIds, sendEmail = true, ...notification } = params;
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

  if (sendEmail) {
    void runBroadcastEmailDispatch(userIds, {
      title: notification.title,
      body: notification.body,
      linkUrl: notification.linkUrl,
    }).catch((error) => {
      console.error("broadcast email dispatch error", error);
    });
  }

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
