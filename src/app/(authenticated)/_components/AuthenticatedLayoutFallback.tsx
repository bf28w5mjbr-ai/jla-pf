import type { ReactNode } from "react";
import { UnreadNotificationCountProvider } from "@/components/UnreadNotificationCountContext";
import { cn } from "@/lib/utils";

function SidebarNavSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 py-4" aria-hidden>
      <div className="mb-2 h-8 w-28 animate-pulse rounded-md bg-muted-foreground/15" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-xl bg-muted/40" />
      ))}
    </div>
  );
}

/** 認証レイアウトの DB 取得中もページ本体を先に描画する */
export function AuthenticatedLayoutFallback({ children }: { children: ReactNode }) {
  return (
    <UnreadNotificationCountProvider initialUnreadCount={0}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "hidden shrink-0 border-r border-border/80 bg-card/95 lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-[17rem] lg:flex-col"
          )}
          aria-hidden
        >
          <SidebarNavSkeleton />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="flex h-12 shrink-0 items-center border-b border-border/60 px-3 lg:hidden"
            aria-hidden
          >
            <div className="h-8 w-8 animate-pulse rounded-md bg-muted/50" />
            <div className="ml-3 h-5 w-24 animate-pulse rounded bg-muted/40" />
          </div>
          <main className="app-main-canvas min-h-screen min-w-0 flex-1 px-[var(--app-content-gutter)] pb-[var(--safe-area-bottom)] pt-2 lg:pt-[var(--safe-area-top)]">
            {children}
          </main>
        </div>
      </div>
    </UnreadNotificationCountProvider>
  );
}
