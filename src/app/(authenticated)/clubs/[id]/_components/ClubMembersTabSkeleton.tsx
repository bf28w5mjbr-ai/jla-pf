export function ClubMembersTabSkeleton() {
  return (
    <section
      className="rounded-2xl border border-border/55 bg-background/70 px-4 py-3 sm:px-5 sm:py-4"
      role="status"
      aria-live="polite"
      aria-label="メンバー一覧を読み込み中"
    >
      <div className="space-y-3">
        <div className="border-b border-border/45 pb-3">
          <div className="h-3 w-12 animate-pulse rounded bg-muted-foreground/10" />
          <div className="mt-1.5 h-5 w-24 animate-pulse rounded-md bg-muted-foreground/15" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border/55">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border/45 px-2.5 py-1.5 last:border-b-0"
            >
              <div className="h-4 flex-1 animate-pulse rounded bg-muted-foreground/10" />
              <div className="h-6 w-14 animate-pulse rounded bg-muted-foreground/10" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
