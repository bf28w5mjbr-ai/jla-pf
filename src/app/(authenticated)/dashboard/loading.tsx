import {
  DashboardDeferredSkeleton,
  DashboardMainSkeleton,
} from "./_components/DashboardPageSkeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col">
      <DashboardMainSkeleton />
      <DashboardDeferredSkeleton />
    </div>
  );
}
