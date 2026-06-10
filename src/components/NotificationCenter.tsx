"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Settings2,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useUnreadNotificationCount } from "@/components/UnreadNotificationCountContext";
import { cn } from "@/lib/utils";

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

type CategoryKey = NotificationItem["category"];

const CATEGORY_CONFIG: Record<
  CategoryKey,
  {
    label: string;
    icon: typeof Bell;
    accent: string;
    glow: string;
    iconBg: string;
    iconColor: string;
    hoverBorder: string;
  }
> = {
  GENERAL: {
    label: "一般",
    icon: Bell,
    accent: "from-primary/70 via-primary/25 to-transparent",
    glow: "bg-primary/8 dark:bg-primary/10",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    hoverBorder: "hover:border-primary/25 dark:hover:border-primary/35",
  },
  CLUB: {
    label: "クラブ",
    icon: Users,
    accent: "from-blue-500/70 via-blue-400/25 to-transparent",
    glow: "bg-blue-500/8 dark:bg-blue-400/6",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600 dark:text-blue-400",
    hoverBorder: "hover:border-blue-200/70 dark:hover:border-blue-900/45",
  },
  COMPETITION: {
    label: "大会",
    icon: Trophy,
    accent: "from-amber-500/70 via-amber-400/25 to-transparent",
    glow: "bg-amber-500/8 dark:bg-amber-400/6",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    hoverBorder: "hover:border-amber-200/70 dark:hover:border-amber-900/45",
  },
  PAYMENT: {
    label: "決済",
    icon: CreditCard,
    accent: "from-emerald-500/70 via-emerald-400/25 to-transparent",
    glow: "bg-emerald-500/8 dark:bg-emerald-400/6",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    hoverBorder: "hover:border-emerald-200/70 dark:hover:border-emerald-900/45",
  },
  SYSTEM: {
    label: "システム",
    icon: Settings2,
    accent: "from-violet-500/70 via-violet-400/25 to-transparent",
    glow: "bg-violet-500/8 dark:bg-violet-400/6",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    hoverBorder: "hover:border-violet-200/70 dark:hover:border-violet-900/45",
  },
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24 && startOfDay(date).getTime() === startOfDay(now).getTime()) {
    return `${diffHours}時間前`;
  }

  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (startOfDay(date).getTime() === yesterday.getTime()) {
    return `昨日 ${date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
  }

  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BODY_COLLAPSE_CHAR_THRESHOLD = 80;
const BODY_COLLAPSE_LINE_THRESHOLD = 2;

function isLongNotificationBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  return (
    trimmed.length > BODY_COLLAPSE_CHAR_THRESHOLD ||
    trimmed.split("\n").length > BODY_COLLAPSE_LINE_THRESHOLD
  );
}

function groupLabelForDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(date);

  if (target.getTime() === today.getTime()) return "今日";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (target.getTime() === yesterday.getTime()) return "昨日";
  return "それ以前";
}

function NotificationRow({
  item,
  onMarkRead,
}: {
  item: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.GENERAL;
  const Icon = config.icon;
  const isLongBody = isLongNotificationBody(item.body);

  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 transition-[border-color,background-color,box-shadow] duration-200",
        config.hoverBorder,
        item.read ? "opacity-75" : "shadow-sm"
      )}
    >
      <div
        className={cn("pointer-events-none absolute -right-6 -top-6 size-28 rounded-full", config.glow)}
        aria-hidden
      />
      <div
        className={cn(
          "absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-gradient-to-b sm:bottom-5 sm:top-5",
          config.accent
        )}
        aria-hidden
      />

      <div className="relative flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-12",
            config.iconBg
          )}
        >
          <Icon className={cn("size-5", config.iconColor)} strokeWidth={1.75} aria-hidden />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-5 px-2 text-[10px] font-medium">
                  {config.label}
                </Badge>
                {!item.read ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                    未読
                  </span>
                ) : null}
              </div>
              <p className="text-balance text-sm font-semibold leading-snug text-foreground sm:text-base">
                {item.title}
              </p>
            </div>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={item.createdAt}
              title={new Date(item.createdAt).toLocaleString("ja-JP")}
            >
              {formatNotificationTime(item.createdAt)}
            </time>
          </div>

          {item.body ? (
            <div className="space-y-1">
              <p
                className={cn(
                  "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
                  isLongBody && !expanded && "line-clamp-2"
                )}
              >
                {item.body}
              </p>
              {isLongBody ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <>
                      閉じる
                      <ChevronUp className="size-3.5" strokeWidth={1.75} aria-hidden />
                    </>
                  ) : (
                    <>
                      もっと見る
                      <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {!item.read ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => onMarkRead(item.id)}
              >
                <CheckCheck className="size-3.5" strokeWidth={1.75} aria-hidden />
                既読にする
              </Button>
            ) : null}
            {item.linkUrl ? (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
                <Link href={item.linkUrl}>
                  開く
                  <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function NotificationCenter({ initialItems, initialUnreadCount }: Props) {
  const router = useRouter();
  const unreadNotification = useUnreadNotificationCount();
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const setUnreadCountEverywhere = useCallback(
    (next: number | ((prev: number) => number)) => {
      setUnreadCount(next);
      unreadNotification?.setUnreadCount(next);
    },
    [unreadNotification]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/notifications?limit=100");
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as {
        items: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.items);
      setUnreadCountEverywhere(data.unreadCount);
    } catch (error) {
      console.error("notification refresh error", error);
    }
  }, [setUnreadCountEverywhere]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/notifications/sync", { method: "POST" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { created?: number; updated?: number; removed?: number };
        if ((data.created ?? 0) > 0 || (data.updated ?? 0) > 0 || (data.removed ?? 0) > 0) {
          void refresh();
        }
      } catch (error) {
        console.error("notification sync error", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const pollMs = 60_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refresh();
    };
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [refresh]);

  const groupedSections = useMemo(() => {
    const order = ["今日", "昨日", "それ以前"] as const;
    const buckets = new Map<string, NotificationItem[]>();
    for (const label of order) {
      buckets.set(label, []);
    }
    for (const item of items) {
      const label = groupLabelForDate(item.createdAt);
      buckets.get(label)?.push(item);
    }
    return order
      .map((label) => ({ label, items: buckets.get(label) ?? [] }))
      .filter((section) => section.items.length > 0);
  }, [items]);

  const markOneRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.read) {
      return;
    }

    try {
      const res = await fetch(`/api/user/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setUnreadCountEverywhere((prev) => Math.max(prev - 1, 0));
      router.refresh();
    } catch (error) {
      console.error("mark read error", error);
      toast.error("既読更新に失敗しました");
    }
  };

  const markAllRead = async () => {
    const prevItems = items;
    const prevUnreadCount = unreadCount;
    try {
      setIsMarkingAll(true);
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCountEverywhere(0);

      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", read: true }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
      toast.success("すべて既読にしました");
    } catch (error) {
      setItems(prevItems);
      setUnreadCountEverywhere(prevUnreadCount);
      console.error("mark all read error", error);
      toast.error("既読更新に失敗しました");
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-9 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <BellRing className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span className="text-sm font-medium">通知</span>
            </div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              通知センター
            </h1>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge
              variant={unreadCount > 0 ? "default" : "secondary"}
              className="h-7 px-3 text-xs font-medium"
            >
              {unreadCount} 件未読
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={markAllRead}
              disabled={isMarkingAll || unreadCount === 0}
            >
              <CheckCheck className="size-3.5" strokeWidth={1.75} aria-hidden />
              {isMarkingAll ? "処理中…" : "すべて既読"}
            </Button>
          </div>
        </div>
      </header>

      {groupedSections.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/80 bg-muted/10 px-6 py-16 text-center">
          <div
            className="pointer-events-none absolute left-1/2 top-8 size-24 -translate-x-1/2 rounded-full bg-primary/5"
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/50">
              <Bell className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">通知はまだありません</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              大会のお知らせやクラブからの連絡が届くと、ここに表示されます。
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSections.map((section) => (
            <section key={section.label} className="space-y-3">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {section.label}
              </h2>
              <ul className="space-y-3">
                {section.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onMarkRead={markOneRead} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
