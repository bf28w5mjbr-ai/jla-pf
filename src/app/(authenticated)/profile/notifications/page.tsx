import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import NotificationCenter from "@/components/NotificationCenter";

export const dynamic = "force-dynamic";

export default async function ProfileNotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
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
      where: { userId: session.userId, read: false },
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
