export function ClubMembersTabSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-7 w-40 animate-pulse rounded bg-muted/50" aria-hidden />
      <div className="h-48 animate-pulse rounded-lg border border-border/60 bg-muted/25" aria-hidden />
      <div className="h-64 animate-pulse rounded-lg border border-border/60 bg-muted/20" aria-hidden />
      <p className="text-sm text-muted-foreground">メンバー一覧を読み込んでいます…</p>
    </div>
  );
}
