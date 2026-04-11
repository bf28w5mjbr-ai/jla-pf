/**
 * 通知スケジューラ
 */
import { prisma } from "@/lib/prisma";
import { formatAdminWallClockSameAsDatetimeLocal } from "@/lib/datetimeLocal";
import { createNotification } from "@/lib/notificationService";
import { SHOW_PROFILE_QUALIFICATIONS_MANAGEMENT_NAV } from "@/lib/profileQualificationsNav";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendEntryDeadlineReminders(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * DAY_MS);

  const competitions = await prisma.competition.findMany({
    where: {
      entryEndDate: {
        gte: now,
        lte: windowEnd,
      },
    },
    select: { id: true, name: true, organizationId: true, entryEndDate: true },
  });

  if (competitions.length === 0) {
    return;
  }

  const orgIds = Array.from(new Set(competitions.map((comp) => comp.organizationId)));
  const orgAdmins = await prisma.orgAdmin.findMany({
    where: { organizationId: { in: orgIds } },
    select: { userId: true, organizationId: true },
  });

  const orgAdminMap = orgAdmins.reduce<Record<string, string[]>>((acc, admin) => {
    acc[admin.organizationId] = acc[admin.organizationId] ?? [];
    acc[admin.organizationId].push(admin.userId);
    return acc;
  }, {});

  for (const competition of competitions) {
    const targets = orgAdminMap[competition.organizationId] ?? [];
    if (targets.length === 0) continue;
    await Promise.all(
      targets.map((userId: string) =>
        createNotification({
          userId,
          category: "COMPETITION",
          type: "ENTRY_DEADLINE_REMINDER",
          title: "エントリー締切が近づいています",
          body: `${competition.name} のエントリー締切: ${
            formatAdminWallClockSameAsDatetimeLocal(competition.entryEndDate) ?? "未設定"
          }（日本時間）`,
          linkUrl: `/competitions/${competition.id}`,
        })
      )
    );
  }
}

export async function sendRelayDeadlineReminders(): Promise<void> {
  // リレーオーダー締切機能が未整備のため、現状は未送信
  return;
}

export async function sendQualificationExpiryReminders(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 30 * DAY_MS);

  const expiring = await prisma.qualification.findMany({
    where: {
      status: "APPROVED",
      expiryDate: {
        gte: now,
        lte: windowEnd,
      },
    },
    select: { id: true, userId: true, kind: true, expiryDate: true },
  });

  await Promise.all(
    expiring.map((qualification) =>
      createNotification({
        userId: qualification.userId,
        category: "SYSTEM",
        type: "QUALIFICATION_EXPIRY_REMINDER",
        title: "資格の有効期限が近づいています",
        body: `${qualification.kind} の期限: ${qualification.expiryDate?.toLocaleDateString('ja-JP')}`,
        linkUrl: SHOW_PROFILE_QUALIFICATIONS_MANAGEMENT_NAV
          ? "/profile/qualifications"
          : "/dashboard",
      })
    )
  );
}

export async function sendMaintenanceNotice(params: {
  startTime: Date;
  endTime: Date;
  description: string;
}): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
  });

  await Promise.all(
    users.map((user) =>
      createNotification({
        userId: user.id,
        category: "SYSTEM",
        type: "MAINTENANCE_NOTICE",
        title: "メンテナンスのお知らせ",
        body: `${params.description}\n${params.startTime.toLocaleString('ja-JP')} 〜 ${params.endTime.toLocaleString('ja-JP')}`,
      })
    )
  );
}
