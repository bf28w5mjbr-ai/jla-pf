"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type NotificationItem = {
  id: string;
  category: "GENERAL" | "CLUB" | "COMPETITION" | "PAYMENT" | "SYSTEM";
  type: string;
  title: string;
  body: string;
  read: boolean;
  linkUrl: string | null;
  createdAt: string;
};

type Props = {
  initialItems: NotificationItem[];
  initialUnreadCount: number;
};

export default function NotificationCenter({ initialItems, initialUnreadCount }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/notifications?limit=100");
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as {
        items: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error("notification refresh error", error);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const grouped = useMemo(() => {
    return items;
  }, [items]);

  const markOneRead = async (id: string) => {
    try {
      const res = await fetch(`/api/user/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(prev - 1, 0));
      router.refresh();
    } catch (error) {
      console.error("mark read error", error);
      toast.error("既読更新に失敗しました");
    }
  };

  const markAllRead = async () => {
    try {
      setIsMarkingAll(true);
      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", read: true }),
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
      router.refresh();
      toast.success("すべて既読にしました");
    } catch (error) {
      console.error("mark all read error", error);
      toast.error("既読更新に失敗しました");
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">通知センター</h1>
          <Badge variant={unreadCount > 0 ? "default" : "secondary"}>{unreadCount} 未読</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={markAllRead} disabled={isMarkingAll || unreadCount === 0}>
          すべて既読
        </Button>
      </div>

      {grouped.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">通知はまだありません。</Card>
      ) : (
        <div className="space-y-2">
          {grouped.map((item) => (
            <Card key={item.id} className={`p-4 ${item.read ? "opacity-80" : "border-primary/40"}`}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    {!item.read ? <Badge className="text-[10px]">未読</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("ja-JP")}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                <div className="flex items-center gap-2">
                  {!item.read ? (
                    <Button size="sm" variant="ghost" onClick={() => markOneRead(item.id)}>
                      既読
                    </Button>
                  ) : null}
                  {item.linkUrl ? (
                    <Button size="sm" asChild>
                      <Link href={item.linkUrl}>開く</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
