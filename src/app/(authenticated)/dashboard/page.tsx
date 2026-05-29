import { Metadata } from "next";
import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { DashboardMain } from "./_components/DashboardMain";
import { DashboardTechnicalOfficialBannerSlot } from "./_components/DashboardTechnicalOfficialBannerSlot";
import {
  DashboardMainSkeleton,
  DashboardTechnicalOfficialBannerSkeleton,
} from "./_components/DashboardPageSkeleton";

export const metadata: Metadata = {
  title: "ダッシュボード | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getRequiredAuthenticatedUserId();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <Suspense fallback={<DashboardTechnicalOfficialBannerSkeleton />}>
        <DashboardTechnicalOfficialBannerSlot userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMain userId={userId} />
      </Suspense>
    </div>
  );
}
