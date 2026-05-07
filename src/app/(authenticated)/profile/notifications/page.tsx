import { redirect } from "next/navigation";

import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import NotificationCenter from "@/components/NotificationCenter";

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
    <div className="app-page mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
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
