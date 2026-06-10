import Link from "next/link";
import { cn } from "@/lib/utils";

export function CompetitionPublicHeaderSkeleton({
  layout = "classic",
}: {
  layout?: "classic" | "editorial";
} = {}) {
  if (layout === "editorial") {
    return (
      <div className="space-y-5" role="status" aria-label="大会情報を読み込み中">
        <div className="h-48 animate-pulse rounded-2xl border border-border/55 bg-muted/20" />
        <div className="h-36 animate-pulse rounded-2xl border border-border/55 bg-muted/15" />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border/80 shadow-md ring-1 ring-border/40"
      role="status"
      aria-label="大会情報を読み込み中"
    >
      <div className="space-y-4 bg-gradient-to-br from-primary/[0.07] via-background to-muted/15 px-3 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="h-8 w-3/4 max-w-md animate-pulse rounded-md bg-muted-foreground/15" />
          <div className="flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-md bg-muted-foreground/15" />
            <div className="h-6 w-24 animate-pulse rounded-md bg-muted-foreground/15" />
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/90 p-3 sm:p-4">
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted-foreground/15" />
            <div className="grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2">
              <div className="h-12 animate-pulse rounded bg-muted-foreground/10" />
              <div className="h-12 animate-pulse rounded bg-muted-foreground/10" />
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border/80 bg-muted/10 px-3 py-4 sm:px-6 sm:py-5">
        <div className="h-28 animate-pulse rounded-xl border border-primary/10 bg-muted/25" />
      </div>
    </div>
  );
}

export function CompetitionPublicOverviewPanelSkeleton({
  layout = "classic",
}: {
  layout?: "classic" | "editorial";
} = {}) {
  return (
    <div className="space-y-4" role="status" aria-label="大会ページを読み込み中">
      <div
        className={cn(
          "h-64 animate-pulse border bg-muted/30",
          layout === "editorial" ? "rounded-2xl border-border/55" : "rounded-xl border-border/60"
        )}
      />
      <div className="h-40 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-32 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}

export function CompetitionPublicStartListPanelSkeleton({
  layout = "classic",
}: {
  layout?: "classic" | "editorial";
} = {}) {
  const isEditorial = layout === "editorial";
  return (
    <div className="space-y-4" role="status" aria-label="スタートリストを読み込み中">
      <div className="flex justify-end">
        <div
          className={cn(
            "h-9 w-28 animate-pulse border bg-muted/30",
            isEditorial ? "rounded-xl border-border/55" : "rounded-lg border-border/60"
          )}
        />
      </div>
      <div
        className={cn(
          "min-h-[320px] animate-pulse border bg-muted/25",
          isEditorial ? "rounded-2xl border-border/55" : "rounded-xl border-border/60"
        )}
      />
    </div>
  );
}

export function CompetitionPublicPageTabsSkeleton({
  detailBasePath,
  layout = "classic",
}: {
  competitionId?: string;
  detailBasePath: string;
  layout?: "classic" | "editorial";
}) {
  const isEditorial = layout === "editorial";
  return (
    <div className="w-full space-y-4" role="status" aria-label="タブを読み込み中">
      <div
        className={cn(
          isEditorial
            ? "grid grid-cols-2 gap-1 rounded-2xl border border-border/55 bg-background/95 p-1.5 shadow-sm"
            : "grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto"
        )}
      >
        <Link
          href={detailBasePath}
          className="flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground shadow-sm sm:h-8"
        >
          大会情報
        </Link>
        <Link
          href={`${detailBasePath}?tab=results`}
          className="flex h-9 items-center justify-center rounded-lg border border-border/70 bg-muted/40 px-3 text-xs font-medium text-foreground/70 shadow-sm sm:h-8"
        >
          レース情報
        </Link>
      </div>
      <CompetitionPublicOverviewPanelSkeleton layout={layout} />
    </div>
  );
}

export function CompetitionPublicPageLoadingSkeleton() {
  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <CompetitionPublicHeaderSkeleton />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto">
          <div className="h-9 w-full animate-pulse rounded-lg bg-background/80 sm:h-8 sm:w-24" />
          <div className="h-9 w-full animate-pulse rounded-lg bg-muted/40 sm:h-8 sm:w-28" />
        </div>
        <CompetitionPublicOverviewPanelSkeleton />
      </div>
    </div>
  );
}

export function CompetitionPublicClientBlockSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("animate-pulse rounded-xl border border-border/60 bg-muted/25", className)}
      aria-hidden
    />
  );
}
