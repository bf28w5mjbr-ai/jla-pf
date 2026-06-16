import { Suspense } from "react";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { canViewClubDetailPage } from "@/lib/clubAccess";
import { parseClubDetailTab } from "@/lib/clubDetailTab";
import { prisma } from "@/server/db";
import { ClubDetailHeaderLoader } from "./_components/ClubDetailHeaderLoader";
import { ClubDetailTabsLoader } from "./_components/ClubDetailTabsLoader";
import {
  ClubDetailHeaderSkeleton,
  ClubDetailTabsSkeleton,
} from "./_components/ClubDetailPageSkeleton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId || !(await canViewClubDetailPage(id, sess.userId))) {
    return { title: "クラブ | Bluvium" };
  }

  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${club?.name || "クラブ"} | Bluvium`,
  };
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = parseClubDetailTab(tab);

  return (
    <div className="flex flex-col">
      <Suspense fallback={<ClubDetailHeaderSkeleton />}>
        <ClubDetailHeaderLoader clubId={id} />
      </Suspense>
      <Suspense fallback={<ClubDetailTabsSkeleton />}>
        <ClubDetailTabsLoader clubId={id} activeTab={activeTab} />
      </Suspense>
    </div>
  );
}
