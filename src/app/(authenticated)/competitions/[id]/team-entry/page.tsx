import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UsersRound } from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import TeamEntryHistoryPanel from "@/components/TeamEntryHistoryPanel";
import CompetitionTeamEntryManager from "@/components/CompetitionTeamEntryManager";
import { formatCompetitionEntryPeriodRangeJa } from "@/lib/datetimeLocal";
import { getStripeProcessingFeeBpsFromEnv } from "@/lib/stripeProcessingFee";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";

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
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

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
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          sex: true,
          category: true,
          maxTeamEntriesPerClub: true,
        },
      },
    },
  });

  if (!competition) {
    notFound();
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

  const adminClubs = [...adminMemberships]
    .sort((a, b) => a.club.name.localeCompare(b.club.name, "ja"))
    .map((m) => m.club);
  const adminClubIds = adminClubs.map((c) => c.id);

  const [teamEntries, teamPayments, prepaidSlotsAll, prepaidMembershipsAll] = await Promise.all([
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
      orderBy: [{ clubId: "asc" }, { eventId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.payment.findMany({
      where: {
        ownerType: "CLUB",
        ownerId: {
          in: adminClubIds.map((id) => buildTeamEntryPaymentOwnerId(competition.id, id)),
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
        user: { select: { id: true, familyName: true, givenName: true } },
      },
      orderBy: [{ clubId: "asc" }, { user: { familyName: "asc" } }, { user: { givenName: "asc" } }],
    }),
  ]);

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
      const ownerId = buildTeamEntryPaymentOwnerId(competition.id, cid);
      const payment = teamPayments.find((item) => item.ownerId === ownerId);
      return [
        cid,
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
          : undefined,
      ];
    })
  ) as Record<
    string,
    | {
        id: string;
        status: string;
        amount: number;
        stripeCheckoutSessionId: string | null;
        finalizedAt: string | null;
      }
    | undefined
  >;

  const initialPrepaidIndividualUserIdsByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      prepaidSlotsAll.filter((s) => s.clubId === cid).map((s) => s.coveredUserId),
    ])
  ) as Record<string, string[]>;

  const prepaidMemberOptionsByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      prepaidMembershipsAll
        .filter((m) => m.clubId === cid)
        .map((m) => ({
          userId: m.user.id,
          name: `${m.user.familyName} ${m.user.givenName}`,
        })),
    ])
  ) as Record<string, { userId: string; name: string }[]>;

  const entryFee =
    competition.entryFee && typeof competition.entryFee === "object"
      ? (competition.entryFee as { teamEntryFeePerTeam?: number })
      : null;
  const teamEntryFeePerTeam = entryFee?.teamEntryFeePerTeam ?? 0;
  const clubIndividualEntryBillingTiming = resolveClubIndividualEntryBillingTiming(competition.entryFee);

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

      <div className="space-y-4 border-b border-border/60 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            チームエントリー
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {competition.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            申込と請求確認は大会配下で行います。メンバー割り当てはクラブ詳細配下の「割り当て」ページから操作してください。
          </p>
          {entryStart && entryEnd ? (
            <p className="mt-1 text-xs text-muted-foreground">
              エントリー期間: {formatCompetitionEntryPeriodRangeJa(entryStart, entryEnd)}
            </p>
          ) : null}
        </div>
      </div>

      <TeamEntryHistoryPanel
        competitionId={competition.id}
        competitionName={competition.name}
        teamEntryFeePerTeam={teamEntryFeePerTeam}
        clubs={adminClubs}
        events={competition.events.map((event) => ({
          id: event.id,
          name: event.name,
          sex: event.sex,
          category: event.category,
        }))}
        teamEntries={teamEntries}
        billingByClub={billingByClub}
        viewOnly={!entryWindowOpen}
      />

      {entryWindowOpen ? (
        <CompetitionTeamEntryManager
          competitionId={competition.id}
          clubs={adminClubs}
          initialSelectedClubId={preferredClubId}
          teamEvents={competition.events.map((event) => ({
            id: event.id,
            name: event.name,
            sex: event.sex,
            category: event.category,
            maxTeamEntriesPerClub: event.maxTeamEntriesPerClub ?? null,
          }))}
          initialEntriesByClub={initialEntriesByClub}
          teamEntryFeePerTeam={teamEntryFeePerTeam}
          entryWindowOpen={entryWindowOpen}
          billingByClub={billingByClub}
          competitionCategory={competition.category}
          cardProcessingFeeBps={getStripeProcessingFeeBpsFromEnv()}
          clubIndividualEntryBillingTiming={clubIndividualEntryBillingTiming}
          prepaidMemberOptionsByClub={prepaidMemberOptionsByClub}
          initialPrepaidIndividualUserIdsByClub={initialPrepaidIndividualUserIdsByClub}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">エントリー受付は終了しています</CardTitle>
            <CardDescription className="text-xs">
              登録済み内容は上部の履歴で確認できます。メンバー割り当てはクラブ詳細配下で続行してください。
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
