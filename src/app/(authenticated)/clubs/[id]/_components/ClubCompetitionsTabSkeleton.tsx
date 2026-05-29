import { TabsContent } from "@/components/ui/tabs";

export function ClubCompetitionsTabSkeleton() {
  return (
    <TabsContent value="competitions" className="space-y-3 pt-1.5 sm:space-y-4 sm:pt-2">
      <div className="space-y-6" role="status" aria-label="参加大会を読み込み中">
        <div className="overflow-hidden rounded-xl border border-border/80 shadow-md">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-muted-foreground/15" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-6 w-32 animate-pulse rounded-md bg-muted-foreground/15" />
                  <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted-foreground/10" />
                </div>
              </div>
              <div className="h-9 w-full animate-pulse rounded-md bg-muted-foreground/15 sm:w-28" />
            </div>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-muted/25" />
            <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-muted/20" />
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
