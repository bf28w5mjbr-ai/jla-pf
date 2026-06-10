import { Metadata } from "next";
import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { DashboardMain } from "./_components/DashboardMain";
import { DashboardMainDeferredSlot } from "./_components/DashboardMainDeferredSlot";
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
    <div className="flex flex-col">
      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMain userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardDeferredSkeleton />}>
        <DashboardMainDeferredSlot userId={userId} />
      </Suspense>
    </div>
  );
}
