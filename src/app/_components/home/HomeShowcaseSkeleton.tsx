import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`shrink-0 snap-start overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ${className ?? ""}`}
    >
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-muted-foreground/15" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted-foreground/15" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted-foreground/10" />
          </div>
        </div>
        <div className="mt-auto space-y-2">
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted-foreground/10" />
          <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/10" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted-foreground/10" />
        </div>
      </div>
    </div>
  );
}

export function HomeCompetitionsShowcaseSkeleton() {
  return (
    <section className="w-full py-10 sm:py-14" aria-busy="true" aria-label="開催予定の大会を読み込み中">
      <div className="mx-auto w-full max-w-3xl px-4 sm:max-w-4xl lg:max-w-5xl">
        <HomeSectionHeading label="Competitions" title="開催予定の大会" />
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-16 animate-pulse rounded-full bg-muted-foreground/10"
            />
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:px-6">
        <ul className="flex w-max gap-4 snap-x snap-mandatory">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <CardSkeleton className="min-w-[16rem] max-w-[18rem] sm:min-w-[18rem]" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeClubsShowcaseSkeleton() {
  return (
    <section className="w-full py-10 sm:py-14" aria-busy="true" aria-label="クラブ一覧を読み込み中">
      <div className="mx-auto w-full max-w-3xl px-4 sm:max-w-4xl lg:max-w-5xl">
        <HomeSectionHeading label="Clubs" title="クラブを探す" />
      </div>
      <div className="mt-6 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:px-6">
        <ul className="flex w-max gap-4 snap-x snap-mandatory">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <div className="min-w-[14rem] max-w-[16rem] shrink-0 snap-start overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:min-w-[15rem]">
                <div className="flex h-full flex-col items-center p-5">
                  <div className="h-16 w-16 animate-pulse rounded-full bg-muted-foreground/15" />
                  <div className="mt-4 h-4 w-24 animate-pulse rounded bg-muted-foreground/15" />
                  <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted-foreground/10" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
