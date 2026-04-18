import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Settings,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import DashboardProfilePhoto from "@/components/DashboardProfilePhoto";
import NfcTagManager from "@/components/NfcTagManager";
import EntryWithdrawRequestButton from "@/components/EntryWithdrawRequestButton";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { cn } from "@/lib/utils";

function calcAge(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

type OfficialAttendanceAggRow = {
  total: bigint;
  a_days: bigint;
  b_days: bigint;
  weighted_days: number | null;
};

export async function DashboardMain({ userId }: { userId: string }) {
  const [user, entries, attendancePreview, attendanceAggRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        familyName: true,
        givenName: true,
        familyNameKana: true,
        givenNameKana: true,
        phoneNumber: true,
        dateOfBirth: true,
        jlaMemberNumber: true,
        nfcTagId: true,
        profilePhotoUrl: true,
        _count: { select: { passkeyCredentials: true } },
        memberships: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            club: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
        },
        qualifications: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            status: true,
            expiryDate: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.competitionEntry.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        totalFee: true,
        createdAt: true,
        clubIndividualFeePaidAt: true,
        competition: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
          },
        },
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          take: 5,
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
      where: { userId },
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
      WHERE a."userId" = ${userId}
    `,
  ]);

  if (!user) redirect("/login");

  const agg = attendanceAggRows[0];
  const officialAttendanceTotalDays = Number(agg?.total ?? BigInt(0));
  const officialAttendanceAClassDays = Number(agg?.a_days ?? BigInt(0));
  const officialAttendanceBClassDays = Number(agg?.b_days ?? BigInt(0));
  const officialAttendanceWeightedDays = Number(agg?.weighted_days ?? 0);

  const clubStatusLabel = {
    APPROVED: "所属",
    PENDING: "申請中",
    REJECTED: "却下",
  } as const;

  const clubStatusClass = {
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    PENDING: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    REJECTED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  } as const;

  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");

  const playerRegistrationKeywords = ["選手登録", "player registration", "player_registration"];
  const lifesaverKeywords = ["認定ライフセーバー", "certified lifesaver", "cls"];

  const matchesKeywords = (value: string | null | undefined, keywords: string[]) => {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return false;
    return keywords.some((keyword) => {
      const normalizedKeyword = normalize(keyword);
      return (
        normalizedValue === normalizedKeyword ||
        normalizedValue.includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizedValue)
      );
    });
  };

  const isRegistrationKind = (value: string | null | undefined) =>
    matchesKeywords(value, playerRegistrationKeywords) || matchesKeywords(value, lifesaverKeywords);

  const registrationQualifications = user.qualifications.filter((q) => isRegistrationKind(q.kind));
  const ownedQualifications = user.qualifications.filter((q) => !isRegistrationKind(q.kind));

  const qualificationStatusLabel = {
    APPROVED: "有効",
    PENDING: "審査中",
    REJECTED: "却下",
    EXPIRED: "期限切れ",
  } as const;
  const qualificationStatusClass = {
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    PENDING: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    REJECTED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    EXPIRED: "border-border bg-muted text-muted-foreground",
  } as const;

  const pendingMemberships = user.memberships.filter((m) => m.status === "PENDING");

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-border/80 pb-8">
        <div className="flex items-center gap-2 text-primary">
          <LayoutDashboard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">マイページ</span>
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          ダッシュボード
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          プロフィール・エントリー・所属クラブの状況をひと目で確認できます。
        </p>
      </header>

      {/* プロフィール */}
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <div className="border-b border-border/80 bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
              プロフィール
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                設定
              </Link>
            </Button>
          </div>
        </div>
        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-6 md:grid-cols-[88px_1fr]">
            <div className="flex justify-center md:justify-start">
              <DashboardProfilePhoto
                currentPhotoUrl={user.profilePhotoUrl}
                userName={`${user.familyName}${user.givenName}`}
              />
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {user.familyName} {user.givenName}
                  </h2>
                  <span className="text-sm text-muted-foreground">{calcAge(user.dateOfBirth)}歳</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  フリガナ：{user.familyNameKana} {user.givenNameKana}
                </p>
              </div>

              <div className="grid gap-5 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">所属クラブ</h3>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <Link href={appRoutes.profile.clubs()} aria-label="クラブを追加" title="クラブを追加">
                        <Plus className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.memberships.length === 0 && (
                      <p className="text-sm text-muted-foreground">未所属です。クラブ参加を申請できます。</p>
                    )}
                    {user.memberships.map((m) => (
                      <span
                        key={m.id}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm",
                          clubStatusClass[m.status]
                        )}
                        title={clubStatusLabel[m.status]}
                      >
                        <span title={m.club.abbreviation ? m.club.name : undefined}>
                          {m.club.abbreviation || m.club.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                    <dt className="font-medium text-muted-foreground">電話番号</dt>
                    <dd className="mt-0.5 font-mono text-foreground">{user.phoneNumber}</dd>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 sm:col-span-2">
                    <dt className="font-medium text-muted-foreground">メール</dt>
                    <dd className="mt-0.5 break-all font-mono text-foreground">{user.email}</dd>
                  </div>
                  {user.jlaMemberNumber ? (
                    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 sm:col-span-2">
                      <dt className="font-medium text-muted-foreground">JLA会員番号</dt>
                      <dd className="mt-0.5 font-mono text-foreground">{user.jlaMemberNumber}</dd>
                    </div>
                  ) : null}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">NFCタグ紐付け</h3>
                  <div className="mt-2 rounded-xl border border-border bg-background p-3">
                    <NfcTagManager initialNfcTagId={user.nfcTagId ?? null} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">保有資格</h3>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <Link href="/qualifications" aria-label="資格を選択" title="資格を選択">
                        <Plus className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-3 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground">登録資格</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {registrationQualifications.length === 0 && (
                          <p className="text-xs text-muted-foreground">登録資格はまだありません。</p>
                        )}
                        {registrationQualifications.map((q) => {
                          const expiryDate = q.expiryDate ? new Date(q.expiryDate) : null;
                          const now = new Date();
                          const isExpired = !!expiryDate && expiryDate.getTime() < now.getTime();
                          const isExpiringSoon =
                            !!expiryDate &&
                            !isExpired &&
                            expiryDate.getTime() - now.getTime() <= 1000 * 60 * 60 * 24 * 30;
                          const status = isExpired ? "EXPIRED" : q.status;

                          return (
                            <div key={q.id} className="relative inline-flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm",
                                  qualificationStatusClass[status]
                                )}
                                title={`${qualificationStatusLabel[status]}${expiryDate ? `｜有効期限 ${expiryDate.toLocaleDateString("ja-JP")}` : ""}`}
                              >
                                <span>{q.kind}</span>
                              </span>
                              {isExpiringSoon ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                  !
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground">保有資格</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ownedQualifications.length === 0 && (
                          <p className="text-xs text-muted-foreground">保有資格はまだありません。</p>
                        )}
                        {ownedQualifications.map((q) => {
                          const expiryDate = q.expiryDate ? new Date(q.expiryDate) : null;
                          const now = new Date();
                          const isExpired = !!expiryDate && expiryDate.getTime() < now.getTime();
                          const isExpiringSoon =
                            !!expiryDate &&
                            !isExpired &&
                            expiryDate.getTime() - now.getTime() <= 1000 * 60 * 60 * 24 * 30;
                          const status = isExpired ? "EXPIRED" : q.status;

                          return (
                            <div key={q.id} className="relative inline-flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm",
                                  qualificationStatusClass[status]
                                )}
                                title={`${qualificationStatusLabel[status]}${expiryDate ? `｜有効期限 ${expiryDate.toLocaleDateString("ja-JP")}` : ""}`}
                              >
                                <span>{q.kind}</span>
                              </span>
                              {isExpiringSoon ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                  !
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {user._count.passkeyCredentials === 0 ? (
        <Card padding="none" className="overflow-hidden border-primary/30 bg-primary/[0.06] shadow-sm dark:bg-primary/10">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Shield className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-semibold text-foreground">パスキーでログインを強化</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  端末の顔・指紋やセキュリティキーでログインできます。フィッシング対策と、デバイスに紐づく認証として推奨します。
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
              <Link href="/register/passkey?returnTo=%2Fdashboard">パスキーを登録</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
                });
                const canIssueReceipt = userStatus.businessEstablished && entry.status !== "CANCELLED";
                const isResultPublished =
                  entry.competition.status === "COMPLETED" || entry.competition.status === "ONGOING";
                const eventIds = [...new Set(entry.items.map((item) => item.eventId))];
                const withdrawnEventIds = new Set(
                  entry.participantStatuses
                    .filter(
                      (status) =>
                        status.status === "DNS" &&
                        typeof status.reason === "string" &&
                        status.reason.includes("棄権")
                    )
                    .map((status) => status.eventId)
                );
                const hasWithdrawRequest = withdrawnEventIds.size > 0;
                const fullyWithdrawn =
                  eventIds.length > 0 && eventIds.every((eventId) => withdrawnEventIds.has(eventId));
                const canRequestWithdraw =
                  entry.status !== "CANCELLED" &&
                  eventIds.length > 0 &&
                  !fullyWithdrawn &&
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
                            {hasWithdrawRequest ? ` / 棄権申請済み（${withdrawnEventIds.size}種目）` : ""}
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
                          <EntryWithdrawRequestButton
                            competitionId={entry.competition.id}
                            entryId={entry.id}
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
    </div>
  );
}
