import { revalidateTag } from "next/cache";
import type { PrismaClient } from "@prisma/client";
import { appRoutes } from "@/lib/appRoutes";
import { notificationUnreadCountTag } from "@/lib/cacheTags";
import {
  listClubAdminTechnicalOfficialAlerts,
  type ClubAdminTechnicalOfficialAlert,
} from "@/lib/technicalOfficialQueries";
import { prisma } from "@/server/db";

export const TECHNICAL_OFFICIAL_SHORTAGE_NOTIFICATION_TYPE = "TECHNICAL_OFFICIAL_SHORTAGE";

export function technicalOfficialShortageRelatedId(clubId: string, competitionId: string): string {
  return `${clubId}:${competitionId}`;
}

export function buildTechnicalOfficialShortageNotificationContent(
  alert: Pick<
    ClubAdminTechnicalOfficialAlert,
    "clubId" | "clubName" | "competitionName" | "required" | "assigned" | "shortage"
  >
) {
  return {
    title: "テクニカルオフィシャルが不足しています",
    body: `${alert.clubName} · ${alert.competitionName}（必要 ${alert.required} 人 / 充足 ${alert.assigned} 人 · 不足 ${alert.shortage} 人）`,
    linkUrl: appRoutes.clubs.tab(alert.clubId, "competitions"),
  };
}

export async function syncTechnicalOfficialShortageNotificationsForUser(
  userId: string,
  db: PrismaClient = prisma
): Promise<{ created: number; updated: number; removed: number }> {
  const alerts = await listClubAdminTechnicalOfficialAlerts(db, userId);
  const activeRelatedIds = new Set(
    alerts.map((alert) => technicalOfficialShortageRelatedId(alert.clubId, alert.competitionId))
  );

  const existing = await db.notification.findMany({
    where: {
      userId,
      type: TECHNICAL_OFFICIAL_SHORTAGE_NOTIFICATION_TYPE,
    },
    select: { id: true, relatedId: true, body: true },
  });

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const notification of existing) {
    if (!notification.relatedId || activeRelatedIds.has(notification.relatedId)) continue;
    await db.notification.delete({ where: { id: notification.id } });
    removed += 1;
  }

  const existingByRelatedId = new Map(
    existing
      .filter((notification) => notification.relatedId)
      .map((notification) => [notification.relatedId!, notification])
  );

  for (const alert of alerts) {
    const relatedId = technicalOfficialShortageRelatedId(alert.clubId, alert.competitionId);
    const { title, body, linkUrl } = buildTechnicalOfficialShortageNotificationContent(alert);
    const previous = existingByRelatedId.get(relatedId);

    if (previous) {
      if (previous.body !== body) {
        await db.notification.update({
          where: { id: previous.id },
          data: { title, body, linkUrl, read: false },
        });
        updated += 1;
      }
      continue;
    }

    await db.notification.create({
      data: {
        userId,
        category: "CLUB",
        type: TECHNICAL_OFFICIAL_SHORTAGE_NOTIFICATION_TYPE,
        title,
        body,
        relatedId,
        linkUrl,
        read: false,
      },
    });
    created += 1;
  }

  if (created > 0 || updated > 0 || removed > 0) {
    revalidateTag(notificationUnreadCountTag(userId), "max");
  }

  return { created, updated, removed };
}
