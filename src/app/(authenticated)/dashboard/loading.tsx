import {
  DashboardDeferredSkeleton,
  DashboardMainSkeleton,
  DashboardTechnicalOfficialBannerSkeleton,
} from "./_components/DashboardPageSkeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <DashboardTechnicalOfficialBannerSkeleton />
      <div className="space-y-8">
        <div className="space-y-2 border-b border-border/80 pb-6">
          <div className="h-5 w-24 animate-pulse rounded bg-muted-foreground/15" />
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted-foreground/15" />
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted-foreground/10" />
        </div>
        <DashboardMainSkeleton />
        <DashboardDeferredSkeleton />
      </div>
    </div>
  );
}
