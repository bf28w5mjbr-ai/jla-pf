import { Metadata } from "next";
import Link from "next/link";

import { redirect, notFound } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, CircleDollarSign, MapPin, ShieldCheck, UserCheck } from "lucide-react";
import {
  formatAdminWallClockSameAsDatetimeLocal,
  formatCompactJaDateRange,
} from "@/lib/datetimeLocal";
import { EntryDeadlineCountdown } from "@/components/competitions/EntryDeadlineCountdown";
import { OfficialApplicationForm } from "@/components/OfficialApplicationForm";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

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
    title: `オフィシャルエントリー | ${competition?.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionOfficialEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getRequiredAuthenticatedUserId();

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: userId },
          },
        },
      },
      officialApplications: {
        where: { userId: userId },
        select: { status: true, positionName: true, message: true },
        take: 1,
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }
  if (competition.status === "CANCELLED") {
    notFound();
  }
  if (!(competition.officialRecruitmentEnabled ?? true)) {
    notFound();
  }

  const myOfficialApplication = competition.officialApplications[0] ?? null;
  const [individualClubRows, teamClubRows, myApprovedMemberships] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId: competition.id,
        clubId: { not: null },
        status: { not: "CANCELLED" },
      },
      select: { clubId: true },
      distinct: ["clubId"],
    }),
    prisma.teamEntry.findMany({
      where: { competitionId: competition.id },
      select: { clubId: true },
      distinct: ["clubId"],
    }),
    prisma.membership.findMany({
      where: { userId: userId, status: "APPROVED" },
      select: { clubId: true },
    }),
  ]);
  const clubIdSet = new Set<string>();
  for (const row of individualClubRows) {
    if (row.clubId) clubIdSet.add(row.clubId);
  }
  for (const row of teamClubRows) {
    clubIdSet.add(row.clubId);
  }
  for (const m of myApprovedMemberships) {
    clubIdSet.add(m.clubId);
  }
  const technicalClubs =
    clubIdSet.size === 0
      ? []
      : await prisma.club.findMany({
          where: { id: { in: [...clubIdSet] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });

  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const entryStartISO = entryStart?.toISOString() ?? null;
  const entryEndISO = entryEnd?.toISOString() ?? null;
  const formattedEntryStart = entryStart
    ? formatAdminWallClockSameAsDatetimeLocal(entryStart)
    : null;
  const formattedEntryEnd = entryEnd ? formatAdminWallClockSameAsDatetimeLocal(entryEnd) : null;

  const competitionPeriodLabel = formatCompactJaDateRange(
    new Date(competition.startDate),
    competition.endDate ? new Date(competition.endDate) : null
  );
  const now = new Date();
  const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;
  const canSubmitOfficial = entryWindowOpen || isOrgAdmin;
  const submitBlockedReason = canSubmitOfficial
    ? null
    : "競技者エントリー受付期間外のため、現在はオフィシャル応募できません。";
  const applicationStatusLabel =
    myOfficialApplication?.status === "PENDING"
      ? "応募済み"
      : myOfficialApplication?.status === "APPROVED"
        ? "受付済み"
        : myOfficialApplication?.status === "REJECTED"
          ? "再応募できます"
          : "未応募";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <Card padding="none" className="border-border/80 shadow-sm">
        <CardHeader className="space-y-3 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal text-muted-foreground">
                  オフィシャルエントリー
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {applicationStatusLabel}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-balance text-xl font-bold tracking-tight sm:text-2xl">
                  {competition.name}
                </CardTitle>
                {competition.nameKana ? (
                  <CardDescription className="mt-1 text-xs">{competition.nameKana}</CardDescription>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                <p className="text-xs font-medium text-foreground/80">
                  {competition.organization.name}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="tabular-nums">{competitionPeriodLabel}</span>
                  </span>
                  {competition.venue ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{competition.venue}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:self-start"
              asChild
            >
              <Link href={appRoutes.competitions.root(competition.id)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                大会ページへ
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <EntryDeadlineCountdown
            entryStartISO={entryStartISO}
            entryEndISO={entryEndISO}
            formattedStart={formattedEntryStart}
            formattedEnd={formattedEntryEnd}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/80 bg-card/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <UserCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                申請方式
              </p>
              <p className="mt-1 text-xs text-muted-foreground">「参加する」意思登録のみ</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-card/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CircleDollarSign className="h-3.5 w-3.5 text-primary" aria-hidden />
                費用
              </p>
              <p className="mt-1 text-xs text-muted-foreground">エントリー料は発生しません</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-card/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                資格判定
              </p>
              <p className="mt-1 text-xs text-muted-foreground">設定時のみ資格要件で自動判定</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <OfficialApplicationForm
        competitionId={competition.id}
        initialApplication={myOfficialApplication}
        canSubmit={canSubmitOfficial}
        submitBlockedReason={submitBlockedReason}
        showAdminOverrideHint={isOrgAdmin && !entryWindowOpen}
        technicalOfficialEnabled={competition.technicalOfficialRecruitmentEnabled ?? true}
        technicalClubs={technicalClubs.map((c) => ({ clubId: c.id, clubName: c.name }))}
      />
    </div>
  );
}
