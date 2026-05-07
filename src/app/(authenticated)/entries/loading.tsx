import { Card, CardContent } from "@/components/ui/card";

export default function EntriesLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-6 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <div className="space-y-3 border-b border-border/80 pb-6">
        <div className="h-5 w-28 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-40 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/40" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="h-5 w-56 animate-pulse rounded bg-muted/50" />
                <div className="h-4 w-40 animate-pulse rounded bg-muted/35" />
              </div>
              <div className="h-9 w-28 animate-pulse rounded-md bg-muted/40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
