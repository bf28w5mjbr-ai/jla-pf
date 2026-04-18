import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { DashboardMain } from "./_components/DashboardMain";
import { DashboardTechnicalOfficialBannerSlot } from "./_components/DashboardTechnicalOfficialBannerSlot";

export const metadata: Metadata = {
  title: "ダッシュボード | Bluvium",
};

export const dynamic = "force-dynamic";

function TechnicalOfficialBannerSkeleton() {
  return (
    <div
      className="h-14 animate-pulse rounded-lg border border-border/50 bg-muted/30"
      aria-hidden
    />
  );
}

function DashboardMainSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-[7.5rem] animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-96 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-52 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
    </div>
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const userId = sess.userId;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Suspense fallback={<TechnicalOfficialBannerSkeleton />}>
        <DashboardTechnicalOfficialBannerSlot userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMain userId={userId} />
      </Suspense>
    </div>
  );
}
