import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import type { AuthenticatedAppUser } from "@/lib/authenticatedLayoutData";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { dashboardSectionClassName } from "./dashboardLayout";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import { DashboardCareerSection } from "./DashboardCareerSection";
import { DashboardEntryStatusCard } from "./DashboardEntryStatusCard";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import {
  buildWithdrawableEventOptions,
  filterIndividualEventIdsFromEntry,
  hasSelectableWithdrawEvents,
} from "@/lib/entryWithdrawalRequest";
import { loadUserPodiumResults } from "@/lib/dashboardUserPodiumResults";

type OfficialAttendanceAggRow = {
  total: bigint;
  a_days: bigint;
  b_days: bigint;
  weighted_days: number | null;
};

type Props = {
  user: AuthenticatedAppUser;
};

/** エントリー・経歴など DB 集約が重いブロック（Suspense 内でストリーミング） */
export async function DashboardMainDeferred({ user }: Props) {
  const [entries, attendancePreview, attendanceAggRows, podiumResults] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        status: true,
        totalFee: true,
        createdAt: true,
        clubIndividualFeePaidAt: true,
        organizerPostPayApprovedAt: true,
        organizerManualPaidAt: true,
        competition: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            startListSettings: true,
          },
        },
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { status: true },
        },
        items: {
          select: {
            eventId: true,
          },
        },
        participantStatuses: {
          where: {
            participantType: "INDIVIDUAL",
          },
          select: {
            eventId: true,
            status: true,
            reason: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.competitionOfficialAttendance.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        attendanceDate: true,
        method: true,
        competition: {
          select: {
            id: true,
            name: true,
            competitionType: true,
          },
        },
      },
      orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    prisma.$queryRaw<OfficialAttendanceAggRow[]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE co."competitionType" = 'A')::bigint AS a_days,
        COUNT(*) FILTER (WHERE co."competitionType" = 'B')::bigint AS b_days,
        COALESCE(
          SUM(
            CASE
              WHEN co."competitionType" = 'A' THEN 1::double precision
              WHEN co."competitionType" = 'B' THEN 0.5::double precision
              ELSE 0::double precision
            END
          ),
          0
        ) AS weighted_days
      FROM "CompetitionOfficialAttendance" a
      INNER JOIN "Competition" co ON co.id = a."competitionId"
      WHERE a."userId" = ${user.id}
    `,
    loadUserPodiumResults(user.id),
  ] as const);

  const eventIds = [...new Set(entries.flatMap((e) => e.items.map((i) => i.eventId)))];
  const events =
    eventIds.length > 0
      ? await prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, name: true, type: true, competitionId: true },
        })
      : [];

  const eventsByCompetitionId = new Map<
    string,
    Array<{ id: string; name: string; type: (typeof events)[number]["type"]; competitionId: string }>
  >();
  for (const event of events) {
    const list = eventsByCompetitionId.get(event.competitionId) ?? [];
    list.push(event);
    eventsByCompetitionId.set(event.competitionId, list);
  }

  const agg = attendanceAggRows[0];
  const officialAttendanceTotalDays = Number(agg?.total ?? BigInt(0));
  const officialAttendanceAClassDays = Number(agg?.a_days ?? BigInt(0));
  const officialAttendanceBClassDays = Number(agg?.b_days ?? BigInt(0));
  const officialAttendanceWeightedDays = Number(agg?.weighted_days ?? 0);

  const pendingMemberships = user.memberships.filter((m) => m.status === "PENDING");

  return (
    <section className={cn(dashboardSectionClassName, "border-t border-border/40 pb-16 pt-12 sm:pb-20 sm:pt-16")}>
      <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Entries
        </p>
        <h3 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          エントリー状況
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">直近の大会エントリー（最大5件）</p>

        <div className="mt-6 space-y-3 sm:space-y-4">
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 px-5 py-10 text-center text-sm text-muted-foreground">
              まだエントリー履歴がありません。
            </p>
          ) : (
            entries.map((entry) => {
              const checkoutSessions = entry.checkoutSessions.map((s) => ({ status: s.status }));
              const userStatus = getEntryUserFacingStatus({
                status: entry.status,
                totalFee: entry.totalFee,
                checkoutSessions,
                clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
                organizerPostPayApprovedAt: entry.organizerPostPayApprovedAt,
                organizerManualPaidAt: entry.organizerManualPaidAt,
              });
              const canIssueReceipt = userStatus.businessEstablished && entry.status !== "CANCELLED";
              const isResultPublished =
                entry.competition.status === "COMPLETED" || entry.competition.status === "ONGOING";
              const competitionEvents = eventsByCompetitionId.get(entry.competition.id) ?? [];
              const eventTypeById = new Map(
                competitionEvents.map((event) => [event.id, event.type])
              );
              const eventLabelById = new Map(
                competitionEvents.map((event) => [event.id, event.name])
              );
              const withdrawableEvents = buildWithdrawableEventOptions({
                individualEventIds: filterIndividualEventIdsFromEntry(entry.items, eventTypeById),
                eventLabelById,
                participantStatuses: entry.participantStatuses,
                startListSettings: entry.competition.startListSettings,
              });
              const withdrawnCount = withdrawableEvents.filter((event) => event.alreadyWithdrawn)
                .length;
              const canRequestWithdraw =
                entry.status !== "CANCELLED" &&
                hasSelectableWithdrawEvents(withdrawableEvents) &&
                (entry.competition.status === "PUBLISHED" || entry.competition.status === "ONGOING");

              return (
                <DashboardEntryStatusCard
                  key={entry.id}
                  entryId={entry.id}
                  competitionId={entry.competition.id}
                  competitionName={entry.competition.name}
                  competitionStartDate={entry.competition.startDate}
                  competitionStatus={entry.competition.status}
                  createdAt={entry.createdAt}
                  totalFee={entry.totalFee}
                  entryStatus={entry.status}
                  businessEstablished={userStatus.businessEstablished}
                  userLabel={userStatus.userLabel}
                  hasOpenDispute={checkoutSessions.some((s) => s.status === "DISPUTED")}
                  withdrawnCount={withdrawnCount}
                  canIssueReceipt={canIssueReceipt}
                  isResultPublished={isResultPublished}
                  canRequestWithdraw={canRequestWithdraw}
                  withdrawableEvents={withdrawableEvents}
                />
              );
            })
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Link
            href={appRoutes.me.entries()}
            className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            すべてのエントリー履歴
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </div>

      {pendingMemberships.length > 0 ? (
        <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="border-b border-border/80 bg-muted/25">
            <div className="flex flex-wrap items-center gap-2">
              <Users className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              <CardTitle className="text-lg">申請中のクラブ</CardTitle>
              <Badge
                variant="secondary"
                className="border border-amber-200/80 bg-amber-50 font-normal text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              >
                {pendingMemberships.length} 件
              </Badge>
            </div>
            <CardDescription>承認を待っているクラブ参加申請です。</CardDescription>
          </CardHeader>
          <DataTable
            data={pendingMemberships}
            columns={[
              {
                header: "クラブ名",
                accessor: (m) => m.club.name,
                className: "font-medium text-foreground",
              },
              {
                header: "申請日",
                accessor: (m) => new Date(m.createdAt).toLocaleDateString("ja-JP"),
                className: "text-sm text-muted-foreground",
              },
              {
                header: "ステータス",
                accessor: () => (
                  <Badge
                    variant="secondary"
                    className="border border-amber-200/80 bg-amber-50 font-normal text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    承認待ち
                  </Badge>
                ),
              },
            ]}
            keyExtractor={(m) => m.id}
            emptyMessage="申請中のクラブはありません"
          />
        </Card>
      ) : null}

      <DashboardCareerSection
        stats={{
          totalDays: officialAttendanceTotalDays,
          weightedDays: officialAttendanceWeightedDays,
          aClassDays: officialAttendanceAClassDays,
          bClassDays: officialAttendanceBClassDays,
        }}
        attendancePreview={attendancePreview}
        podiumResults={podiumResults}
      />
      </div>
    </section>
  );
}
