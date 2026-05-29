export default function AuthenticatedSegmentLoading() {
  return (
    <div className="space-y-6 py-2" role="status" aria-label="読み込み中">
      <div className="h-8 w-48 max-w-full animate-pulse rounded-md bg-muted/40" />
      <div className="h-36 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-56 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}
