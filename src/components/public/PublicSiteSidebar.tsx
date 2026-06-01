"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Users, X } from "lucide-react";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import type { PublicSiteShellVariant } from "@/components/public/PublicSiteShellWrapper";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "トップ", href: "/", icon: Home, exact: true },
  { label: "大会", href: "/browse/competitions", icon: Trophy, exact: false },
  { label: "クラブ", href: "/clubs", icon: Users, exact: false },
] as const;

function navLinkClass(active: boolean) {
  return cn(
    "group flex min-h-9 w-full items-center gap-3 rounded-xl border border-transparent py-1.5 pl-2.5 pr-3 text-sm font-medium transition-colors",
    active
      ? "border-primary/20 bg-primary/[0.08] text-foreground shadow-sm dark:bg-primary/15"
      : "text-muted-foreground hover:border-border/80 hover:bg-muted/60 hover:text-foreground"
  );
}

function navIconWrap(active: boolean) {
  return cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-primary/15 text-primary"
      : "bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
  );
}

function isNavActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: PublicSiteShellVariant;
};

export function PublicSiteSidebar({
  open,
  onOpenChange,
  variant = "standard",
}: Props) {
  const pathname = usePathname() || "/";
  const isCover = variant === "cover";

  return (
    <>
      {open ? (
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-[35] bg-black/45 backdrop-blur-[3px]",
            !isCover && "lg:hidden"
          )}
          aria-label="オーバーレイを閉じる"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        id="public-site-sidebar"
        className={cn(
          "fixed top-0 z-40 flex h-[100dvh] w-[min(19rem,calc(100vw-2.25rem))] max-w-[88vw] flex-col border-r border-border/80 bg-card/98 shadow-xl transition-transform duration-300 ease-out",
          "pt-[var(--safe-area-top,0px)]",
          !isCover &&
            "lg:sticky lg:top-0 lg:z-0 lg:h-auto lg:min-h-screen lg:w-[15rem] lg:max-w-none lg:shrink-0 lg:shadow-sm",
          open ? "translate-x-0" : "-translate-x-full",
          !isCover && "lg:translate-x-0"
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4 pt-3 sm:px-4">
          <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
            <Link
              href="/"
              className="flex min-w-0 flex-1 items-center rounded-2xl px-1.5 py-1.5 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenChange(false)}
            >
              <BluviumWordmark variant="nav" />
            </Link>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label="公開サイトメニュー">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={navLinkClass(active)}
                >
                  <span className={navIconWrap(active)}>
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border/60 pt-4">
            <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
              エントリーやクラブ参加はログイン後にご利用いただけます。
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
