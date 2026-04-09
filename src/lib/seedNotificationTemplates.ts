/**
 * Bluvium デフォルトテンプレートシード
 */

import { prisma } from "./prisma";

export async function seedNotificationTemplates() {
  const existingCount = await prisma.notificationTemplate.count();
  if (existingCount > 0) {
    return;
  }

  await prisma.notificationTemplate.createMany({
    data: [
      {
        type: "SYSTEM_NOTICE",
        category: "SYSTEM",
        titleTemplate: "{title}",
        bodyTemplate: "{body}",
      },
      {
        type: "CLUB_NOTICE",
        category: "CLUB",
        titleTemplate: "{clubName}からのお知らせ",
        bodyTemplate: "{body}",
      },
      {
        type: "PAYMENT_NOTICE",
        category: "PAYMENT",
        titleTemplate: "支払い通知",
        bodyTemplate: "{body}",
      },
    ],
  });
}
