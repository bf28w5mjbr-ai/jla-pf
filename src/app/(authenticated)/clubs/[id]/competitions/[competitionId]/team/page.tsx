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
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import { buildTeamEntryPaymentOwnerId } from "@/lib/teamEntryPayments";
import CompetitionTeamEntryManager from "@/components/CompetitionTeamEntryManager";
import TeamEntryHistoryPanel from "@/components/TeamEntryHistoryPanel";
import CompetitionTeamAssignmentManager from "@/components/CompetitionTeamAssignmentManager";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";

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
  const tab = tabRaw === "assignment" ? "assignment" : "entry";

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      clubId,
      status: "APPROVED",
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

  if (!membership || !isClubAdminRole(membership.role)) {
    notFound();
  }

  const adminClubs = [membership.club];

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
      events: {
        where: { type: "TEAM" },
        orderBy: { displayOrder: "asc" },
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
      clubId: membership.club.id,
    },
    include: {
      event: {
        select: {
          name: true,
          sex: true,
          teamRelayPositionCount: true,
          teamRelayPositionNames: true,
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
    orderBy: [{ eventId: "asc" }, { createdAt: "asc" }],
  });

  const teamEntriesForHistory = teamEntriesFull.map((e) => ({
    id: e.id,
    clubId: e.clubId,
    eventId: e.eventId,
    teamName: e.teamName,
    updatedAt: e.updatedAt,
  }));

  const teamPayments = await prisma.payment.findMany({
    where: {
      ownerType: "CLUB",
      ownerId: buildTeamEntryPaymentOwnerId(competition.id, membership.club.id),
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
      clubId: membership.club.id,
      status: "SUBMITTED",
    },
    include: {
      user: {
        select: {
          id: true,
          familyName: true,
          givenName: true,
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

  const initialEntriesByClub = {
    [membership.club.id]: teamEntriesFull.map((entry) => ({
      id: entry.id,
      eventId: entry.eventId,
      teamName: entry.teamName,
    })),
  };

  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;

  const billingByClub = (() => {
    const payment = teamPayments.find(
      (item) => item.ownerId === buildTeamEntryPaymentOwnerId(competition.id, membership.club.id)
    );
    return {
      [membership.club.id]: payment
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
    };
  })();

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

  const assignmentsByClub = {
    [club.id]: teamEntriesFull.map((entry) => {
      const slotCount = resolveTeamRelaySlotCount(entry.event.teamRelayPositionCount, entry.members);
      const memberSlots = buildMemberSlotsFromDb(entry.members, slotCount);
      return {
        teamEntryId: entry.id,
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
  };

  const eligibleMembersByClub = {
    [club.id]: eligibleEntries.map((entry) => ({
      userId: entry.user.id,
      name: `${entry.user.familyName} ${entry.user.givenName}`,
    })),
  };

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

  const linkEntry = appRoutes.clubs.competition.team(club.id, competition.id, { tab: "entry" });
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
            チーム種目（{club.name}）
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {competition.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            エントリー・請求・履歴とメンバー割当を、この大会のチーム種目向けにまとめています。
          </p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="チーム種目の区切り">
          <Button
            variant={tab === "entry" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            asChild
          >
            <Link href={linkEntry} scroll={false}>
              エントリー・履歴
            </Link>
          </Button>
          <Button
            variant={tab === "assignment" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            asChild
          >
            <Link href={linkAssignment} scroll={false}>
              メンバー割当
            </Link>
          </Button>
        </nav>
      </div>

      {tab === "entry" ? (
        <>
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="flex flex-col gap-4 border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={entryWindowBadgeClass}>
                    {entryWindowLabel}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-semibold leading-tight sm:text-xl">
                  エントリー・請求
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {entryWindowOpen
                    ? "チーム登録・保存とクラブ単位の請求・決済を行います。保存・決済時に大会側へ反映されます。"
                    : "エントリー受付は終了しています。登録内容の確認のみです。"}
                </CardDescription>
                {entryStart && entryEnd ? (
                  <p className="text-xs text-muted-foreground">
                    エントリー期間: {entryStart.toLocaleString("ja-JP")} 〜{" "}
                    {entryEnd.toLocaleString("ja-JP")}
                  </p>
                ) : null}
              </div>
              <Link href={appRoutes.competitions.root(competition.id)} className="shrink-0">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  大会ページへ戻る
                </Button>
              </Link>
            </CardHeader>
          </Card>

          {!entryWindowOpen && (
            <Card className="border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
              <CardContent className="px-4 py-4 text-sm text-amber-950 dark:text-amber-100">
                <p className="font-medium">エントリー受付は終了しています</p>
                <p className="mt-1.5 leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                  登録内容の閲覧のみです。メンバー割当は上の「メンバー割当」タブから開いてください。
                </p>
              </CardContent>
            </Card>
          )}

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
            teamEntries={teamEntriesForHistory}
            billingByClub={billingByClub}
            viewOnly={!entryWindowOpen}
          />

          {!entryWindowOpen && teamEntriesFull.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">チームエントリー</CardTitle>
                <CardDescription className="text-xs">
                  この大会・このクラブでは、保存済みのチーム登録がありません。
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {entryWindowOpen ? (
            <CompetitionTeamEntryManager
              competitionId={competition.id}
              hasSavedTeamEntries={teamEntriesFull.length > 0}
              clubs={adminClubs}
              teamEvents={competition.events.map((event) => ({
                id: event.id,
                name: event.name,
                sex: event.sex,
                category: event.category,
              }))}
              initialEntriesByClub={initialEntriesByClub}
              teamEntryFeePerTeam={teamEntryFeePerTeam}
              entryWindowOpen={entryWindowOpen}
              billingByClub={billingByClub}
              competitionCategory={competition.category}
            />
          ) : null}
        </>
      ) : (
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
          />
        </>
      )}
    </div>
  );
}
