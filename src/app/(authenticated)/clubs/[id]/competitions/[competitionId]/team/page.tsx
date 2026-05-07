import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appRoutes } from "@/lib/appRoutes";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import CompetitionTeamEntryManager from "@/components/CompetitionTeamEntryManager";
import TeamEntryHistoryPanel from "@/components/TeamEntryHistoryPanel";
import CompetitionTeamAssignmentManager from "@/components/CompetitionTeamAssignmentManager";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";
import { formatCompetitionEntryPeriodRangeJa } from "@/lib/datetimeLocal";
import { getStripeProcessingFeeBpsFromEnv } from "@/lib/stripeProcessingFee";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import {
  prismaCompetitionToTeamAssignmentCompetitionJson,
  prismaEventToTeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";

function parseRelayPositionNames(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveTeamRelaySlotCount(
  configured: number | null | undefined,
  members: { order: number | null }[]
): number {
  if (typeof configured === "number" && configured >= 1 && configured <= 32) {
    return configured;
  }
  const maxOrder = members.reduce((acc, m) => Math.max(acc, m.order ?? 0), 0);
  return Math.min(32, Math.max(maxOrder, members.length, 1));
}

function buildMemberSlotsFromDb(
  members: { userId: string; order: number | null }[],
  slotCount: number
): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: slotCount }, () => null);
  const sorted = [...members].sort((a, b) => {
    const ao = a.order ?? 999;
    const bo = b.order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.userId.localeCompare(b.userId);
  });
  let fillCursor = 0;
  for (const m of sorted) {
    if (m.order != null && m.order >= 1) {
      const idx = m.order - 1;
      if (idx < slotCount) slots[idx] = m.userId;
    } else {
      while (fillCursor < slotCount && slots[fillCursor] != null) fillCursor++;
      if (fillCursor < slotCount) {
        slots[fillCursor] = m.userId;
        fillCursor++;
      }
    }
  }
  return slots;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}): Promise<Metadata> {
  const { competitionId, id } = await params;
  const { tab } = await searchParams;
  const [competition, club] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true },
    }),
    prisma.club.findUnique({
      where: { id },
      select: { name: true },
    }),
  ]);
  const mode = tab === "assignment" ? "メンバー割当" : "チーム種目";
  return {
    title: `${mode} | ${competition?.name || "大会"} | ${club?.name || "クラブ"} | Bluvium`,
  };
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

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const adminMemberships = await prisma.membership.findMany({
    where: {
      userId: session.userId,
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
  });

  const membership = adminMemberships.find((m) => m.clubId === clubId);
  if (!membership) {
    notFound();
  }

  const adminClubs = [...adminMemberships]
    .sort((a, b) => a.club.name.localeCompare(b.club.name, "ja"))
    .map((m) => m.club);
  const adminClubIds = adminClubs.map((c) => c.id);

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
          },
        },
      },
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          displayOrder: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
          underBandKeysEnabled: true,
        },
      },
      events: {
        where: { type: "TEAM" },
        orderBy: { displayOrder: "asc" },
        include: {
          ageCategory: {
            select: { id: true, underBandKeysEnabled: true },
          },
        },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const canEditCompetition = hasOrgAdminAccess(competition.organization.admins);
  if (competition.status === "DRAFT" && !canEditCompetition) {
    notFound();
  }

  const teamEntriesFull = await prisma.teamEntry.findMany({
    where: {
      competitionId: competition.id,
      clubId: { in: adminClubIds },
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          sex: true,
          minAge: true,
          maxAge: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
          ageCategoryId: true,
          underBandKeysOverride: true,
          underAgeEligibilityEnabled: true,
          teamRelayPositionCount: true,
          teamRelayPositionNames: true,
          ageCategory: {
            select: { id: true, underBandKeysEnabled: true },
          },
        },
      },
      members: {
        orderBy: { order: "asc" },
        select: {
          userId: true,
          order: true,
        },
      },
    },
    orderBy: [{ clubId: "asc" }, { eventId: "asc" }, { createdAt: "asc" }],
  });

  const teamEntriesForHistory = teamEntriesFull.map((e) => ({
    id: e.id,
    clubId: e.clubId,
    eventId: e.eventId,
    teamName: e.teamName,
    updatedAt: e.updatedAt,
  }));

  const teamPaymentOwnerIds = adminClubIds.map((id) =>
    buildTeamEntryPaymentOwnerId(competition.id, id)
  );
  const teamPayments = await prisma.payment.findMany({
    where: {
      ownerType: "CLUB",
      ownerId: { in: teamPaymentOwnerIds },
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
  });

  const eligibleEntries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: competition.id,
      clubId: { in: adminClubIds },
      status: "SUBMITTED",
    },
    include: {
      user: {
        select: {
          id: true,
          familyName: true,
          givenName: true,
          sex: true,
          dateOfBirth: true,
        },
      },
    },
    orderBy: [{ clubId: "asc" }, { createdAt: "asc" }],
  });

  const entryFee =
    competition.entryFee && typeof competition.entryFee === "object"
      ? (competition.entryFee as { teamEntryFeePerTeam?: number })
      : null;
  const teamEntryFeePerTeam = entryFee?.teamEntryFeePerTeam ?? 0;

  const initialEntriesByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      teamEntriesFull
        .filter((entry) => entry.clubId === cid)
        .map((entry) => ({
          id: entry.id,
          eventId: entry.eventId,
          teamName: entry.teamName,
        })),
    ])
  ) as Record<string, { id: string; eventId: string; teamName: string }[]>;

  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;

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

  const entryWindowLabel =
    !entryStart || !entryEnd
      ? "受付期間未設定"
      : entryWindowOpen
        ? "エントリー受付中"
        : now < entryStart
          ? "受付開始前"
          : "受付終了";
  const entryWindowBadgeClass =
    entryWindowLabel === "エントリー受付中"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
      : entryWindowLabel === "受付開始前"
        ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        : "border-border bg-muted text-muted-foreground";

  const club = membership.club;

  const assignmentsByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      teamEntriesFull
        .filter((entry) => entry.clubId === cid)
        .map((entry) => {
          const slotCount = resolveTeamRelaySlotCount(entry.event.teamRelayPositionCount, entry.members);
          const memberSlots = buildMemberSlotsFromDb(entry.members, slotCount);
          return {
            teamEntryId: entry.id,
            eventId: entry.eventId,
            eventName: entry.event.name,
            sexLabel:
              entry.event.sex === "MALE"
                ? "男子"
                : entry.event.sex === "FEMALE"
                  ? "女子"
                  : "混合",
            teamName: entry.teamName,
            memberUserIds: entry.members.map((member) => member.userId),
            relayPositionCount: entry.event.teamRelayPositionCount ?? null,
            relayPositionLabels: parseRelayPositionNames(entry.event.teamRelayPositionNames),
            memberSlots,
          };
        }),
    ])
  );

  /** クラブに紐づく SUBMITTED エントリー全員（個人種目のみ／チーム種目のみの別を問わず割当候補） */
  const eligibleMembersByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      eligibleEntries
        .filter((entry) => entry.clubId === cid)
        .map((entry) => ({
          userId: entry.user.id,
          name: `${entry.user.familyName} ${entry.user.givenName}`,
          sex: entry.user.sex,
          dateOfBirth: entry.user.dateOfBirth ? entry.user.dateOfBirth.toISOString() : null,
        })),
    ])
  );

  const prepaidSlotsAll = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
    where: {
      competitionId: competition.id,
      clubId: { in: adminClubIds },
      status: {
        in: ["PENDING_CLUB_CHECKOUT", "ACTIVE_WAIVER", "DEFERRED_POST_CLOSE"],
      },
    },
    select: { clubId: true, coveredUserId: true },
    orderBy: [{ clubId: "asc" }, { createdAt: "asc" }],
  });

  const prepaidMembershipsAll = await prisma.membership.findMany({
    where: { clubId: { in: adminClubIds }, status: "APPROVED" },
    include: {
      user: { select: { id: true, familyName: true, givenName: true } },
    },
    orderBy: [{ clubId: "asc" }, { user: { familyName: "asc" } }, { user: { givenName: "asc" } }],
  });

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

  const clubIndividualEntryBillingTiming = resolveClubIndividualEntryBillingTiming(
    competition.entryFee
  );

  const teamAssignmentWindow = await getTeamMemberAssignmentWindowState(
    prisma,
    competition.id,
    {
      entryEndDate: competition.entryEndDate,
      startListSettings: competition.startListSettings,
      startDate: competition.startDate,
    },
    now
  );
  const isAssignmentWindowOpen = teamAssignmentWindow.open;
  const assignmentDeadlineLabel = teamAssignmentWindow.deadlineLabel;

  const marshalBlockByTeamEntryId = Object.fromEntries(
    await getTeamEntryMarshalAssignmentBlockedMap(
      prisma,
      competition.id,
      teamEntriesFull.map((e) => ({ id: e.id, eventId: e.eventId }))
    )
  );

  const teamAssignmentCompetition = prismaCompetitionToTeamAssignmentCompetitionJson({
    startDate: competition.startDate,
    underAgeSystemEnabled: competition.underAgeSystemEnabled ?? false,
    underAgeUThresholds: competition.underAgeUThresholds,
    underAgeOpenEnabled: competition.underAgeOpenEnabled,
    ageCategories: competition.ageCategories,
  });

  const teamAssignmentEventsById = Object.fromEntries(
    competition.events.map((e) => [
      e.id,
      prismaEventToTeamAssignmentEventJson({
        sex: e.sex,
        minAge: e.minAge,
        maxAge: e.maxAge,
        eligibleBirthDateFrom: e.eligibleBirthDateFrom,
        eligibleBirthDateTo: e.eligibleBirthDateTo,
        ageCategoryId: e.ageCategoryId,
        underBandKeysOverride: e.underBandKeysOverride,
        underAgeEligibilityEnabled: e.underAgeEligibilityEnabled,
        ageCategory: e.ageCategory,
      }),
    ])
  );

  const linkAssignment = appRoutes.clubs.competition.team(club.id, competition.id, {
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
          <Link href={appRoutes.competitions.root(competition.id)}>大会ページ</Link>
        </Button>
      </div>

      <div className="space-y-4 border-b border-border/60 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            チーム割り当て（{club.name}）
            {adminClubs.length > 1 ? " · 他クラブも選択可" : ""}
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {competition.name}
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
          <Button
            variant="default"
            size="sm"
            className="rounded-full"
            asChild
          >
            <Link href={linkAssignment} scroll={false}>
              メンバー割当
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" asChild>
            <Link href={appRoutes.competitions.teamEntry(competition.id, { clubId: club.id })}>
              申込・請求ページへ
            </Link>
          </Button>
        </nav>
      </div>

      <>
          <header className="space-y-2 border-b border-border/60 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              メンバー割当
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              ポジションにメンバーを割り当て、大会側スタートリスト反映の前提とします。保存で大会に送信されます。
              {assignmentDeadlineLabel ? (
                <>
                  {" "}
                  <span className="tabular-nums text-foreground/90">
                    目安日時（通知用）: {assignmentDeadlineLabel}
                  </span>
                </>
              ) : null}
            </p>
          </header>

          <CompetitionTeamAssignmentManager
            competitionId={competition.id}
            clubs={adminClubs}
            assignmentsByClub={assignmentsByClub}
            eligibleMembersByClub={eligibleMembersByClub}
            isAssignmentWindowOpen={isAssignmentWindowOpen}
            assignmentDeadlineLabel={assignmentDeadlineLabel}
            marshalBlockByTeamEntryId={marshalBlockByTeamEntryId}
            initialClubId={club.id}
            teamAssignmentCompetition={teamAssignmentCompetition}
            teamAssignmentEventsById={teamAssignmentEventsById}
          />
      </>
    </div>
  );
}
