import { prisma } from "@/server/db";
import { getFirebaseMessaging } from "@/lib/firebaseAdmin";
import { safeServerErrorLog } from "@/lib/safeServerLog";

type PushNotificationPayload = {
  userId: string;
  title: string;
  body: string;
  linkUrl?: string;
};

export async function sendPushNotificationToUser(payload: PushNotificationPayload) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn("pushNotification: firebase messaging unavailable", {
      userId: payload.userId,
      title: payload.title,
    });
    return;
  }

  const tokens = await prisma.deviceToken.findMany({
    where: {
      userId: payload.userId,
      active: true,
    },
    select: {
      token: true,
    },
  });

  if (tokens.length === 0) {
    return;
  }

  let response;
  try {
    response = await messaging.sendEachForMulticast({
      tokens: tokens.map((item) => item.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        linkUrl: payload.linkUrl ?? "",
      },
    });
  } catch (error) {
    safeServerErrorLog("pushNotification.sendEachForMulticast", error);
    return;
  }

  const invalidTokens = response.responses
    .map((result, index) => ({ result, token: tokens[index]?.token }))
    .filter(
      ({ result }) =>
        !result.success &&
        (result.error?.code === "messaging/invalid-registration-token" ||
          result.error?.code === "messaging/registration-token-not-registered")
    )
    .map(({ token }) => token)
    .filter((token): token is string => Boolean(token));

  if (invalidTokens.length > 0) {
    await prisma.deviceToken.updateMany({
      where: {
        token: { in: invalidTokens },
      },
      data: {
        active: false,
      },
    });
  }
}
