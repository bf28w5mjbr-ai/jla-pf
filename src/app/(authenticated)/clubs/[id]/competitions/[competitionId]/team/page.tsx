import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/appRoutes";
import { competitionMetadataTitle } from "@/lib/competitionMetadata";
import { getCompetitionPublicName } from "@/lib/competitionPublicPageLoader";
import TeamAssignmentWorkspace from "./TeamAssignmentWorkspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}): Promise<Metadata> {
  const { competitionId } = await params;
  return competitionMetadataTitle(competitionId, "メンバー割当");
}

function TeamAssignmentSkeleton() {
  return (
    <div
      className="flex min-h-[12rem] flex-col justify-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-6"
      role="status"
      aria-live="polite"
    >
      <div className="h-6 w-48 animate-pulse rounded bg-muted/50" aria-hidden />
      <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/35" aria-hidden />
      <p className="text-sm text-muted-foreground">メンバー割当情報を読み込んでいます…</p>
    </div>
  );
}

export default async function ClubCompetitionTeamHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: clubId, competitionId } = await params;
  const { tab: tabRaw } = await searchParams;
  if (tabRaw !== "assignment") {
    redirect(appRoutes.competitions.teamEntry(competitionId, { clubId }));
  }

  const userId = await getRequiredAuthenticatedUserId();

  const [adminMemberships, competitionNameRow] = await Promise.all([
    prisma.membership.findMany({
      where: {
        userId,
        status: "APPROVED",
        role: "ADMIN",
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        },
      },
    }),
    getCompetitionPublicName(competitionId),
  ]);

  const membership = adminMemberships.find((m) => m.clubId === clubId);
  if (!membership) {
    notFound();
  }

  const adminClubs = [...adminMemberships]
    .sort((a, b) => a.club.name.localeCompare(b.club.name, "ja"))
    .map((m) => m.club);
  const adminClubIds = adminClubs.map((c) => c.id);
  const club = membership.club;
  const competitionName = competitionNameRow?.name ?? "大会";

  const linkAssignment = appRoutes.clubs.competition.team(club.id, competitionId, {
    tab: "assignment",
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link href={appRoutes.clubs.competitionsParticipation(club.id)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            クラブに戻る
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link href={appRoutes.competitions.root(competitionId)}>大会ページ</Link>
        </Button>
      </div>

      <div className="space-y-4 border-b border-border/60 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            チーム割り当て（{club.name}）
            {adminClubs.length > 1 ? " · 他クラブも選択可" : ""}
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {competitionName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            クラブ運用向けのメンバー割り当てページです。チーム申込・請求・履歴は大会配下のチームエントリーページで操作します。
            {adminClubs.length > 1 ? (
              <>
                {" "}
                管理者権限のあるクラブが複数ある場合は、下の「対象クラブ」から切り替えてそれぞれ操作できます。
              </>
            ) : null}
          </p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="チーム種目の区切り">
          <Button variant="default" size="sm" className="rounded-full" asChild>
            <Link href={linkAssignment} scroll={false}>
              メンバー割当
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" asChild>
            <Link href={appRoutes.competitions.teamEntry(competitionId, { clubId: club.id })}>
              申込・請求ページへ
            </Link>
          </Button>
        </nav>
      </div>

      <Suspense fallback={<TeamAssignmentSkeleton />}>
        <TeamAssignmentWorkspace
          competitionId={competitionId}
          userId={userId}
          initialClubId={club.id}
          adminClubs={adminClubs}
          adminClubIds={adminClubIds}
        />
      </Suspense>
    </div>
  );
}
