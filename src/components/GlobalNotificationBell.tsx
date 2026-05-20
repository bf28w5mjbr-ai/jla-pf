import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GlobalNotificationBell({ unreadCount }: { unreadCount: number }) {
  const label =
    unreadCount > 0 ? `通知（未読${unreadCount}件）` : "通知";

  return (
    <Button
      asChild
      size="icon"
      variant="outline"
      className="fixed right-[max(1rem,var(--safe-area-right))] top-[calc(var(--safe-area-top)+0.75rem)] z-[45] flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-card text-primary shadow-lg shadow-primary/10 backdrop-blur-sm transition-[transform,box-shadow] active:scale-[0.98] dark:shadow-black/40"
    >
      <Link href="/profile/notifications" aria-label={label}>
        <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums leading-none text-primary-foreground shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
