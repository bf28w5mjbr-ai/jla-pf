import { BluviumWordmark } from "@/components/BluviumWordmark";

export default function StartListEventLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex justify-center pb-1 lg:hidden">
        <BluviumWordmark variant="compact" />
      </div>
      <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-lg border border-border/60 bg-muted/40" />
      <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-muted/30" />
      <div className="min-h-[200px] animate-pulse rounded-lg border border-border/60 bg-muted/20" />
    </div>
  );
}
