import { Card, CardContent } from "@/components/ui/card";

export default function CompetitionsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <div className="space-y-4 border-b border-border/80 pb-8">
        <div className="h-5 w-24 animate-pulse rounded bg-muted/60" />
        <div className="h-9 w-48 max-w-full animate-pulse rounded bg-muted/60 sm:h-10" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-muted/40" />
        <div className="flex flex-wrap gap-2">
          <div className="h-7 w-20 animate-pulse rounded-full bg-muted/50" />
          <div className="h-7 w-16 animate-pulse rounded-full bg-muted/50" />
          <div className="h-7 w-16 animate-pulse rounded-full bg-muted/50" />
        </div>
      </div>
      <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
        <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
      </div>
      <div className="grid gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="overflow-hidden border-border/80">
            <CardContent className="p-5">
              <div className="h-6 w-2/3 max-w-md animate-pulse rounded bg-muted/50" />
              <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-muted/35" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
