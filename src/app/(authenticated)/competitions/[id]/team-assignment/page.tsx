import { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { competitionMetadataTitle } from "@/lib/competitionMetadata";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isClubAdminRole } from "@/lib/roleScopes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return competitionMetadataTitle(id, "チームメンバー割当");
}

/**
 * 旧パス互換: `/competitions/[id]/team-assignment` → `/clubs/[clubId]/competitions/[competitionId]/team?tab=assignment`
 */
export default async function LegacyCompetitionTeamAssignmentRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const { id: competitionId } = await params;
  const { clubId: clubIdFromQuery } = await searchParams;
  const userId = await getRequiredAuthenticatedUserId();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true },
  });

  if (!competition) {
    redirect("/competitions");
  }

  const clubMemberships = await prisma.membership.findMany({
    where: {
      userId: userId,
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
    orderBy: {
      club: {
        name: "asc",
      },
    },
  });

  const adminMemberships = clubMemberships.filter((m) => isClubAdminRole(m.role));

  if (adminMemberships.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link href={appRoutes.competitions.root(competitionId)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            大会ページに戻る
          </Link>
        </Button>
        <Card className="overflow-hidden border-border/80 shadow-md">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="h-7 w-7" aria-hidden />
            </span>
            <div className="max-w-md space-y-2">
              <p className="text-base font-semibold text-foreground">クラブ管理者のみ利用できます</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                チームメンバー割当は、管理権限のあるクラブの代表者が操作します。
              </p>
            </div>
            <Button variant="default" asChild>
              <Link href={appRoutes.competitions.root(competitionId)}>大会ページを開く</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const preferredClubId =
    clubIdFromQuery && adminMemberships.some((m) => m.club.id === clubIdFromQuery)
      ? clubIdFromQuery
      : adminMemberships[0].club.id;

  redirect(appRoutes.clubs.competition.team(preferredClubId, competitionId, { tab: "assignment" }));
}
