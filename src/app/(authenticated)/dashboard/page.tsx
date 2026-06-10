import { Metadata } from "next";
import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { DashboardMain } from "./_components/DashboardMain";
import { DashboardMainDeferredSlot } from "./_components/DashboardMainDeferredSlot";
import { SyncTechnicalOfficialShortageNotificationsSlot } from "./_components/SyncTechnicalOfficialShortageNotificationsSlot";
import {
  DashboardDeferredSkeleton,
  DashboardMainSkeleton,
} from "./_components/DashboardPageSkeleton";

export const metadata: Metadata = {
  title: "ダッシュボード | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getRequiredAuthenticatedUserId();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <Suspense fallback={null}>
        <SyncTechnicalOfficialShortageNotificationsSlot userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMain userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardDeferredSkeleton />}>
        <DashboardMainDeferredSlot userId={userId} />
      </Suspense>
    </div>
  );
}
