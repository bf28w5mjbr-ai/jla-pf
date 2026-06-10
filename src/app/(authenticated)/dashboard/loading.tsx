import {
  DashboardDeferredSkeleton,
  DashboardMainSkeleton,
} from "./_components/DashboardPageSkeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <DashboardMainSkeleton />
      <DashboardDeferredSkeleton />
    </div>
  );
}
