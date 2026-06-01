import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Plus,
  ReceiptText,
  Trophy,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import type { AuthenticatedAppUser } from "@/lib/authenticatedLayoutData";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import { EntryWithdrawRequestButtonLazy } from "./dashboardDynamicClients";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import {
  buildWithdrawableEventOptions,
  filterIndividualEventIdsFromEntry,
  hasSelectableWithdrawEvents,
} from "@/lib/entryWithdrawalRequest";

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
  const [entries, attendancePreview, attendanceAggRows] = await prisma.$transaction([
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
  ]);

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
    <div className="space-y-8">
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">エントリー状況</CardTitle>
          </div>
          <CardDescription>直近の大会エントリー（最大5件）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 sm:p-6">
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              まだエントリー履歴がありません。
            </p>
          ) : (
            entries.map((entry) => {
              const userStatus = getEntryUserFacingStatus({
                status: entry.status,
                totalFee: entry.totalFee,
                checkoutSessions: entry.checkoutSessions.map((s) => ({ status: s.status })),
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
              const hasWithdrawRequest = withdrawnCount > 0;
              const canRequestWithdraw =
                entry.status !== "CANCELLED" &&
                hasSelectableWithdrawEvents(withdrawableEvents) &&
                (entry.competition.status === "PUBLISHED" || entry.competition.status === "ONGOING");

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm dark:bg-card/40"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Trophy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{entry.competition.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          受付日: {new Date(entry.createdAt).toLocaleDateString("ja-JP")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          状態: {userStatus.userLabel}
                          {hasWithdrawRequest ? ` / 棄権申請済み（${withdrawnCount}種目）` : ""}
                          {" / "}
                          参加費: ¥{entry.totalFee.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button asChild variant="outline" size="sm">
                        <Link href={appRoutes.competitions.entry(entry.competition.id)}>
                          エントリー詳細
                        </Link>
                      </Button>
                      {canIssueReceipt ? (
                        <Button asChild variant="outline" size="sm" className="gap-1">
                          <Link
                            href={`/api/entries/${entry.id}/receipt?format=pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ReceiptText className="h-4 w-4" />
                            領収書
                          </Link>
                        </Button>
                      ) : null}
                      {isResultPublished ? (
                        <Button asChild size="sm">
                          <Link href={appRoutes.competitions.results(entry.competition.id)}>
                            大会リザルト
                          </Link>
                        </Button>
                      ) : null}
                      {canRequestWithdraw ? (
                        <EntryWithdrawRequestButtonLazy
                          competitionId={entry.competition.id}
                          entryId={entry.id}
                          withdrawableEvents={withdrawableEvents}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div className="flex justify-end border-t border-border/60 pt-2">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link href={appRoutes.me.entries()}>
                すべてのエントリー履歴
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">経歴</CardTitle>
          </div>
          <CardDescription>オフィシャル活動実績（出席ベース）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">実出席日数</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {officialAttendanceTotalDays}日
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">換算活動日数</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {officialAttendanceWeightedDays.toFixed(1)}日
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">内訳</p>
              <p className="mt-1 text-sm text-foreground">
                A級 {officialAttendanceAClassDays}日 / B級 {officialAttendanceBClassDays}日
              </p>
            </div>
          </div>

          {officialAttendanceTotalDays === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              まだオフィシャル出席実績がありません。
            </p>
          ) : (
            <div className="space-y-2">
              {attendancePreview.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-1 rounded-lg border border-border/70 bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{row.competition.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.attendanceDate).toLocaleDateString("ja-JP")} /{" "}
                      {row.competition.competitionType === "A"
                        ? "A級"
                        : row.competition.competitionType === "B"
                          ? "B級"
                          : "種別未設定"}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit font-normal">
                    {row.method === "NFC" ? "NFC記録" : "手動記録"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
