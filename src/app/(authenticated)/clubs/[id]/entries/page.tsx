import { Metadata } from "next";
import Link from "next/link";

import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { loadEntryHistoryForClub } from "@/lib/entryHistory";
import EntryHistoryList from "@/components/EntryHistoryList";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `エントリー履歴 | ${club?.name || "クラブ"} | Bluvium`,
  };
}

export default async function ClubEntryHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const userId = await getRequiredAuthenticatedUserId();

  const membership = await prisma.membership.findFirst({
    where: {
      userId: userId,
      clubId,
      status: "APPROVED",
    },
    include: {
      club: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    notFound();
  }

  const entries = await loadEntryHistoryForClub(userId, clubId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <Link href={appRoutes.clubs.tab(clubId, "competitions")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          クラブに戻る
        </Link>
      </Button>
      <EntryHistoryList entries={entries} context="club" clubName={membership.club.name} />
    </div>
  );
}
