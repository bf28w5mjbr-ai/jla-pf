"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  isLoggedIn: boolean;
  onOpenMenu?: () => void;
  isMenuOpen?: boolean;
};

export function PublicSiteHeader({ isLoggedIn, onOpenMenu, isMenuOpen }: Props) {
  const pathname = usePathname() || "/";
  const signInHref = `/login?redirect=${encodeURIComponent(pathname)}`;
  const registerHref = `/register?redirect=${encodeURIComponent(pathname)}`;

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
        style={{ paddingTop: "max(0.625rem, var(--safe-area-top, 0px))" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onOpenMenu ? (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="メニューを開く"
              aria-expanded={isMenuOpen}
              aria-controls="public-site-sidebar"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground transition-colors hover:bg-muted/60 lg:hidden",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-sm font-semibold tracking-tight"
              asChild
            >
              <Link href="/">Bluvium</Link>
            </Button>
            <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
              大会・クラブ情報
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link href="/dashboard">ダッシュボード</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="hidden h-8 text-xs sm:inline-flex" asChild>
                <Link href={registerHref}>新規登録</Link>
              </Button>
              <Button size="sm" className="h-8 text-xs shadow-sm" asChild>
                <Link href={signInHref}>ログイン</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
