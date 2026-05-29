export default function ClubCompetitionTeamLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-28 animate-pulse rounded-md bg-muted/50" aria-hidden />
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted/50" aria-hidden />
      </div>
      <div className="space-y-4 border-b border-border/60 pb-4">
        <div className="h-4 w-40 animate-pulse rounded bg-muted/40" aria-hidden />
        <div className="h-8 w-full max-w-md animate-pulse rounded bg-muted/50" aria-hidden />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-muted/35" aria-hidden />
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-28 animate-pulse rounded-full bg-muted/45" aria-hidden />
          <div className="h-9 w-36 animate-pulse rounded-full bg-muted/40" aria-hidden />
        </div>
      </div>
      <div
        className="flex min-h-[12rem] flex-col justify-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-6"
        role="status"
        aria-live="polite"
      >
        <div className="h-6 w-48 animate-pulse rounded bg-muted/50" aria-hidden />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/35" aria-hidden />
        <p className="text-sm text-muted-foreground">メンバー割当情報を読み込んでいます…</p>
      </div>
    </div>
  );
}
