import { TabsContent } from "@/components/ui/tabs";

export function ClubCompetitionsTabSkeleton() {
  return (
    <TabsContent value="competitions" className="space-y-3" role="status" aria-label="参加大会を読み込み中">
      <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/10" />
      <div className="overflow-hidden rounded-2xl border border-border/55 px-4 py-4">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-border/50 bg-muted/20" />
          ))}
        </div>
      </div>
    </TabsContent>
  );
}
