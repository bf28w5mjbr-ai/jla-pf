"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";

interface AppMobileTopBarProps {
  unreadCount: number;
  onOpenMenu: () => void;
  isMenuOpen: boolean;
}

export function AppMobileTopBar({
  unreadCount,
  onOpenMenu,
  isMenuOpen,
}: AppMobileTopBarProps) {
  const notificationLabel =
    unreadCount > 0 ? `通知（未読${unreadCount}件）` : "通知";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80",
        "dark:bg-card/90",
        "lg:hidden"
      )}
      style={{ paddingTop: "var(--safe-area-top, 0px)" }}
    >
      <div
        className="flex h-14 items-center gap-2"
        style={{
          paddingLeft: "max(0.75rem, var(--safe-area-left, 0px))",
          paddingRight: "max(0.75rem, var(--safe-area-right, 0px))",
        }}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="メニューを開く"
          aria-expanded={isMenuOpen}
          aria-controls="app-sidebar-nav"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted/70 active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>

        <Link
          href={appRoutes.dashboard()}
          className="flex min-w-0 flex-1 items-center justify-start rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="ホーム"
        >
          <BluviumWordmark variant="compact" />
        </Link>

        <Link
          href="/profile/notifications"
          aria-label={notificationLabel}
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-card text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
