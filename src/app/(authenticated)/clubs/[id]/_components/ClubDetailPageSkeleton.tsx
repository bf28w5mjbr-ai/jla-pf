export function ClubDetailHeaderSkeleton() {
  return (
    <header>
      <div
        className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/35 via-background to-muted/25 shadow-sm"
        role="status"
        aria-label="クラブ情報を読み込み中"
      >
        <div className="space-y-2 p-3 sm:space-y-2.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted-foreground/15" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-muted-foreground/15" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded bg-muted-foreground/10" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="h-16 w-16 animate-pulse rounded-lg bg-muted-foreground/15" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-7 w-48 max-w-full animate-pulse rounded-md bg-muted-foreground/15" />
              <div className="h-4 w-36 animate-pulse rounded bg-muted-foreground/10" />
            </div>
          </div>
          <div className="grid gap-1.5 border-t border-border/60 pt-2.5 sm:grid-cols-3 sm:pt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[2.5rem] animate-pulse rounded-lg border border-border/60 bg-card/60 sm:min-h-[2.5rem]"
              />
            ))}
          </div>
          <div className="border-t border-border/60 pt-2.5 sm:pt-3">
            <div className="h-20 animate-pulse rounded-lg border border-border/40 bg-background/40" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function ClubDetailTabsSkeleton() {
  return (
    <div className="mt-3 space-y-4" role="status" aria-label="クラブタブを読み込み中">
      <div className="h-10 animate-pulse rounded-lg border border-border/60 bg-muted/35" />
      <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
    </div>
  );
}

export function ClubDetailPageLoadingSkeleton() {
  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <ClubDetailHeaderSkeleton />
      <ClubDetailTabsSkeleton />
    </div>
  );
}
