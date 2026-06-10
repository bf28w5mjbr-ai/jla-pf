import { dashboardSectionClassName } from "./dashboardLayout";
import { cn } from "@/lib/utils";

/** プロフィール・資格ブロック（DashboardMain）用 */
export function DashboardMainSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true">
      <section className="relative w-full overflow-hidden pb-12 pt-3 md:mx-auto md:max-w-3xl md:px-4 md:pb-16 md:py-16 lg:max-w-5xl lg:py-20">
        <div className="absolute -right-4 top-16 size-32 animate-pulse rounded-full bg-orange-500/10 md:hidden" aria-hidden />
        <div className="absolute right-4 top-3 h-9 w-9 animate-pulse rounded-lg bg-muted/30 md:right-0 md:top-4" />
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] lg:gap-12">
        <div className="space-y-4 px-4 md:px-0">
          <div className="h-10 w-56 max-w-full animate-pulse rounded-lg bg-muted/35" />
          <div className="h-5 w-40 animate-pulse rounded bg-muted/25" />
          <div className="space-y-2 pt-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/25" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted/20" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted/15" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-11 w-full animate-pulse rounded-full bg-muted/20" />
            <div className="h-11 w-full animate-pulse rounded-full bg-muted/15" />
          </div>
        </div>
        <div className="mt-2 hidden aspect-square w-full max-w-[17.5rem] animate-pulse justify-self-end rounded-full bg-orange-500/10 md:block" aria-hidden />
        </div>
      </section>
    </div>
  );
}

/** エントリー・経歴ブロック（DashboardMainDeferred）用 */
export function DashboardDeferredSkeleton() {
  return (
    <section
      className={cn(
        dashboardSectionClassName,
        "border-t border-border/40 py-16 sm:py-20"
      )}
      aria-busy="true"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="h-3 w-14 animate-pulse rounded bg-muted/25" />
          <div className="h-7 w-40 animate-pulse rounded-lg bg-muted/30" />
          <div className="mt-6 space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-border/55 bg-muted/15 sm:h-40"
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-3 w-14 animate-pulse rounded bg-muted/25" />
          <div className="h-7 w-24 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-28 animate-pulse rounded-2xl border border-border/55 bg-muted/15" />
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-2xl border border-border/55 bg-muted/10" />
            <div className="h-16 animate-pulse rounded-2xl border border-border/55 bg-muted/10" />
          </div>
          <div className="h-20 animate-pulse rounded-2xl border border-border/55 bg-muted/10" />
        </div>
      </div>
    </section>
  );
}
