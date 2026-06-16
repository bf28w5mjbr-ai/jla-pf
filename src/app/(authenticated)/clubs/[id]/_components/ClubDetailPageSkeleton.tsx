import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { cn } from "@/lib/utils";

export function ClubDetailHeaderSkeleton() {
  return (
    <>
      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0 pt-10 sm:pt-12"
        )}
        role="status"
        aria-label="クラブ情報を読み込み中"
      >
        <div className="h-9 w-40 animate-pulse rounded-full bg-muted-foreground/10" />
      </section>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-12 pt-8 sm:pb-16 sm:pt-10"
        )}
      >
        <div className="overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6">
          <div className="h-3 w-12 animate-pulse rounded bg-muted-foreground/10" />
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="size-20 animate-pulse rounded-2xl bg-muted-foreground/15" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-8 w-48 max-w-full animate-pulse rounded-md bg-muted-foreground/15" />
              <div className="h-4 w-36 animate-pulse rounded bg-muted-foreground/10" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border/45 pt-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-7 w-24 animate-pulse rounded-full bg-muted-foreground/10"
              />
            ))}
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6">
          <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/10" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted-foreground/10" />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function ClubDetailTabsSkeleton() {
  return (
    <section
      className={cn(
        dashboardSectionClassName,
        "pb-16 pt-12 sm:pb-20 sm:pt-16"
      )}
      role="status"
      aria-label="クラブタブを読み込み中"
    >
      <div className="mb-6 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/10" />
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted-foreground/15" />
      </div>
      <div className="mb-5 h-12 animate-pulse rounded-2xl border border-border/55 bg-muted/25" />
      <div className="h-64 animate-pulse rounded-2xl border border-border/55 bg-muted/20" />
    </section>
  );
}

export function ClubDetailPageLoadingSkeleton() {
  return (
    <div className="flex flex-col">
      <ClubDetailHeaderSkeleton />
      <ClubDetailTabsSkeleton />
    </div>
  );
}
