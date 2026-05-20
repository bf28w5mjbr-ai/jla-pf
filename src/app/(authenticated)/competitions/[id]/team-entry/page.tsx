import { Metadata } from "next";
import Link from "next/link";

import { notFound } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UsersRound } from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";
import type { ClubTeamAndPrepaidBillingPair } from "@/lib/teamEntryPayments";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
} from "@/lib/teamEntryPayments";
import CompetitionTeamEntryWorkspace from "@/components/CompetitionTeamEntryWorkspace";
import { formatCompetitionEntryPeriodRangeJa } from "@/lib/datetimeLocal";
import { getStripeProcessingFeeBpsFromEnv } from "@/lib/stripeProcessingFee";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { competitionEntryPaidCheckoutWhere } from "@/lib/entryCheckoutSessionPaid";

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
 * 大会配下のチームエントリー本体ページ。
 * クラブ運用のメンバー割当は /clubs/[id]/.../assignments へ分離する。
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
  const userId = await getRequiredAuthenticatedUserId();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      status: true,
      entryStartDate: true,
      entryEndDate: true,
      category: true,
      entryFee: true,
      events: {
        where: { type: "TEAM" },
        orderBy: [
          { category: "asc" },
          { ageCategory: { displayOrder: "asc" } },
          { displayOrder: "asc" },
        ],
        select: {
          id: true,
          name: true,
          sex: true,
          category: true,
          displayOrder: true,
          maxTeamEntriesPerClub: true,
          ageCategory: {
            select: { displayOrder: true },
          },
        },
      },
    },
  });

  if (!competition) {
    notFound();
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

  const adminClubs = [...adminMemberships]
    .sort((a, b) => a.club.name.localeCompare(b.club.name, "ja"))
    .map((m) => m.club);
  const adminClubIds = adminClubs.map((c) => c.id);

  const [teamEntries, teamPayments, prepaidSlotsAll, prepaidMembershipsAll, prepaidPaidIndividualCheckoutRows] =
    await Promise.all([
    prisma.teamEntry.findMany({
      where: {
        competitionId: competition.id,
        clubId: { in: adminClubIds },
      },
      select: {
        id: true,
        clubId: true,
        eventId: true,
        teamName: true,
        updatedAt: true,
      },
      orderBy: [
        { clubId: "asc" },
        { event: { category: "asc" } },
        { event: { ageCategory: { displayOrder: "asc" } } },
        { event: { displayOrder: "asc" } },
        { teamName: "asc" },
        { id: "asc" },
      ],
    }),
    prisma.payment.findMany({
      where: {
        ownerType: "CLUB",
        ownerId: {
          in: adminClubIds.flatMap((id) => [
            buildTeamEntryPaymentOwnerId(competition.id, id),
            buildClubPrepaidIndividualPaymentOwnerId(competition.id, id),
          ]),
        },
        type: "COMPETITION_ENTRY_FEE",
      },
      select: {
        ownerId: true,
        id: true,
        status: true,
        amount: true,
        stripeCheckoutSessionId: true,
        metadata: true,
      },
    }),
    prisma.clubCompetitionPrepaidIndividualSlot.findMany({
      where: {
        competitionId: competition.id,
        clubId: { in: adminClubIds },
        status: {
          in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
        },
      },
      select: { clubId: true, coveredUserId: true },
      orderBy: [{ clubId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.membership.findMany({
      where: { clubId: { in: adminClubIds }, status: "APPROVED" },
      include: {
        user: { select: { id: true, profile: { select: { familyName: true, givenName: true } } } },
      },
      orderBy: [
        { clubId: "asc" },
        { user: { profile: { familyName: "asc" } } },
        { user: { profile: { givenName: "asc" } } },
      ],
    }),
    prisma.competitionEntry.findMany({
      where: {
        competitionId: competition.id,
        clubId: { in: adminClubIds },
        status: "SUBMITTED",
        ...competitionEntryPaidCheckoutWhere,
      },
      select: { clubId: true, userId: true },
    }),
  ]);

  const paidIndividualUserIdSetByClub = new Map<string, Set<string>>();
  for (const row of prepaidPaidIndividualCheckoutRows) {
    if (row.clubId == null) continue;
    let set = paidIndividualUserIdSetByClub.get(row.clubId);
    if (!set) {
      set = new Set();
      paidIndividualUserIdSetByClub.set(row.clubId, set);
    }
    set.add(row.userId);
  }

  const initialEntriesByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      teamEntries
        .filter((entry) => entry.clubId === cid)
        .map((entry) => ({
          id: entry.id,
          eventId: entry.eventId,
          teamName: entry.teamName,
        })),
    ])
  ) as Record<string, { id: string; eventId: string; teamName: string }[]>;

  const billingByClub = Object.fromEntries(
    adminClubIds.map((cid) => {
      const teamOwnerId = buildTeamEntryPaymentOwnerId(competition.id, cid);
      const prepaidOwnerId = buildClubPrepaidIndividualPaymentOwnerId(competition.id, cid);
      const teamPay = teamPayments.find((item) => item.ownerId === teamOwnerId);
      const prepaidPay = teamPayments.find((item) => item.ownerId === prepaidOwnerId);
      const snap = (payment: (typeof teamPayments)[number] | undefined) =>
        payment
          ? {
              id: payment.id,
              status: payment.status,
              amount: payment.amount,
              stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
              finalizedAt:
                payment.metadata &&
                typeof payment.metadata === "object" &&
                typeof (payment.metadata as { finalizedAt?: unknown }).finalizedAt === "string"
                  ? ((payment.metadata as { finalizedAt?: string }).finalizedAt ?? null)
                  : null,
            }
          : undefined;
      const team = snap(teamPay);
      const prepaid = snap(prepaidPay);
      if (!team && !prepaid) return [cid, undefined] as const;
      return [cid, { team, prepaid }] as const;
    })
  ) as Record<string, ClubTeamAndPrepaidBillingPair | undefined>;

  const initialPrepaidIndividualUserIdsByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      prepaidSlotsAll.filter((s) => s.clubId === cid).map((s) => s.coveredUserId),
    ])
  ) as Record<string, string[]>;

  const prepaidMemberOptionsByClub = Object.fromEntries(
    adminClubIds.map((cid) => {
      const paidSet = paidIndividualUserIdSetByClub.get(cid) ?? new Set<string>();
      return [
        cid,
        prepaidMembershipsAll
          .filter((m) => m.clubId === cid && !paidSet.has(m.user.id))
          .map((m) => ({
            userId: m.user.id,
            name: `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
          })),
      ];
    })
  ) as Record<string, { userId: string; name: string }[]>;

  const entryFee =
    competition.entryFee && typeof competition.entryFee === "object"
      ? (competition.entryFee as { teamEntryFeePerTeam?: number })
      : null;
  const teamEntryFeePerTeam = entryFee?.teamEntryFeePerTeam ?? 0;

  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link href={appRoutes.competitions.root(competition.id)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            大会ページへ戻る
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">チームエントリー</p>
        <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {competition.name}
        </h1>
        {entryStart && entryEnd ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">エントリー期間</span>
            <span className="tabular-nums">{formatCompetitionEntryPeriodRangeJa(entryStart, entryEnd)}</span>
          </p>
        ) : null}
      </div>

      <CompetitionTeamEntryWorkspace
        competitionId={competition.id}
        competitionName={competition.name}
        preferredClubId={preferredClubId}
        clubs={adminClubs}
        eventsForHistory={competition.events.map((event) => ({
          id: event.id,
          name: event.name,
          sex: event.sex,
          category: event.category,
          displayOrder: event.displayOrder,
          ageCategoryDisplayOrder: event.ageCategory?.displayOrder ?? null,
        }))}
        teamEvents={competition.events.map((event) => ({
          id: event.id,
          name: event.name,
          sex: event.sex,
          category: event.category,
          maxTeamEntriesPerClub: event.maxTeamEntriesPerClub ?? null,
        }))}
        teamEntries={teamEntries}
        initialEntriesByClub={initialEntriesByClub}
        teamEntryFeePerTeam={teamEntryFeePerTeam}
        entryWindowOpen={entryWindowOpen}
        billingByClub={billingByClub}
        competitionCategory={competition.category}
        cardProcessingFeeBps={getStripeProcessingFeeBpsFromEnv()}
        clubIndividualEntryBillingTiming={resolveClubIndividualEntryBillingTiming(competition.entryFee)}
        prepaidMemberOptionsByClub={prepaidMemberOptionsByClub}
        initialPrepaidIndividualUserIdsByClub={initialPrepaidIndividualUserIdsByClub}
      />
    </div>
  );
}
