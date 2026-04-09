import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UsersRound } from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `チームエントリー | ${competition?.name || "大会"} | Bluvium`,
  };
}

/**
 * 旧パス互換: `/competitions/[id]/team-entry` → `/clubs/[clubId]/competitions/[competitionId]/team?tab=entry`
 */
export default async function LegacyCompetitionTeamEntryRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const { id: competitionId } = await params;
  const { clubId: clubIdFromQuery } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, name: true },
  });

  if (!competition) {
    redirect("/competitions");
  }

  const clubMemberships = await prisma.membership.findMany({
    where: {
      userId: session.userId,
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
      <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/15">
            <CardTitle className="text-base font-semibold">チームエントリー</CardTitle>
            <CardDescription className="text-xs">{competition.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-6">
            <div className="flex gap-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <UsersRound className="mt-0.5 h-5 w-5 shrink-0 opacity-80" aria-hidden />
              <p>
                チームエントリーは<strong className="font-semibold">クラブ管理者</strong>
                （代表・副代表など）のみ利用できます。クラブの管理権限があるアカウントでログインしているか確認してください。
              </p>
            </div>
            <Link href={appRoutes.competitions.root(competitionId)}>
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                大会ページへ戻る
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const preferredClubId =
    clubIdFromQuery && adminMemberships.some((m) => m.club.id === clubIdFromQuery)
      ? clubIdFromQuery
      : adminMemberships[0].club.id;

  redirect(appRoutes.clubs.competition.team(preferredClubId, competitionId, { tab: "entry" }));
}
