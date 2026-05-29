import { BluviumWordmark } from "@/components/BluviumWordmark";

function ClubHeaderSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/35 via-background to-muted/25 shadow-sm"
      role="status"
      aria-label="クラブ情報を読み込み中"
    >
      <div className="space-y-3 p-3 sm:p-4">
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted-foreground/15" />
        <div className="flex gap-4">
          <div className="h-16 w-16 animate-pulse rounded-lg bg-muted-foreground/10" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-muted-foreground/15" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted-foreground/10" />
          </div>
        </div>
        <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-3">
          <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
        </div>
      </div>
    </div>
  );
}

export default function ClubDetailLoading() {
  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="flex justify-center pb-1 lg:hidden">
        <BluviumWordmark variant="compact" />
      </div>
      <ClubHeaderSkeleton />
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-lg border border-border/60 bg-muted/30" />
        <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      </div>
    </div>
  );
}
