import { Metadata } from "next";

import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import NotificationCenter from "@/components/NotificationCenter";

export const metadata: Metadata = {
  title: "通知センター | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function ProfileNotificationsPage() {
  const userId = await getRequiredAuthenticatedUserId();

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        category: true,
        type: true,
        title: true,
        body: true,
        read: true,
        linkUrl: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: userId, read: false },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <NotificationCenter
        initialItems={items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        }))}
        initialUnreadCount={unreadCount}
      />
    </div>
  );
}
