import { Metadata } from 'next';
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import type { ClubStatus, Prisma } from "@prisma/client";
import { Building2, CheckCircle2, Search, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ClubApprovalActions from '@/components/ClubApprovalActions';

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: 'クラブ管理 | Bluvium',
};

const statusLabelMap: Record<string, string> = {
  APPROVED: "運用中",
  SUSPENDED: "停止中",
  APPLYING: "（旧）申請中",
  JLA_APPROVED: "（旧）審査通過",
  INACTIVE: "（旧）無効",
};

const statusBadgeClassMap: Record<string, string> = {
  APPROVED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300",
  SUSPENDED:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300",
  APPLYING:
    "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-300",
  JLA_APPROVED:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/40 dark:text-orange-300",
  INACTIVE:
    "border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300",
};

function formatDate(value: Date) {
  return value.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const searchKeyword = sp.q?.trim() ?? "";
  const statusFilter = (sp.status ?? "").trim().toUpperCase();
  const validStatusSet: ReadonlySet<ClubStatus> = new Set([
    "APPROVED",
    "SUSPENDED",
    "APPLYING",
    "JLA_APPROVED",
    "INACTIVE",
  ]);
  const selectedStatus: ClubStatus | "" = validStatusSet.has(statusFilter as ClubStatus)
    ? (statusFilter as ClubStatus)
    : "";

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  
  if (!sess?.userId) redirect("/login");

  // 管理者権限チェック
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true }
  });

  if (!user || user.role !== "PF_ADMIN") {
    redirect("/dashboard");
  }

  const whereClause: Prisma.ClubWhereInput = {
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(searchKeyword
      ? {
          OR: [
            { id: { contains: searchKeyword, mode: "insensitive" as const } },
            { name: { contains: searchKeyword, mode: "insensitive" as const } },
            { representativeFamilyName: { contains: searchKeyword, mode: "insensitive" as const } },
            { representativeGivenName: { contains: searchKeyword, mode: "insensitive" as const } },
            { representativeUser: { email: { contains: searchKeyword, mode: "insensitive" as const } } },
            { creator: { email: { contains: searchKeyword, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [clubs, totalClubCount] = await prisma.$transaction([
    prisma.club.findMany({
      where: whereClause,
      include: {
        creator: {
          select: {
            profile: { select: { familyName: true, givenName: true } },
            email: true,
          }
        },
        representativeUser: {
          select: {
            profile: { select: { familyName: true, givenName: true } },
            email: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.club.count(),
  ]);

  const hasFilters = Boolean(searchKeyword || selectedStatus);

  const statusCount = clubs.reduce<Record<string, number>>((acc, club) => {
    acc[club.status] = (acc[club.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                defaultValue={searchKeyword}
                placeholder="クラブID・クラブ名・代表者名/メール・作成者メールで検索"
                className="flex h-10 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-sm ring-offset-background transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <select
              name="status"
              defaultValue={selectedStatus}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2"
            >
              <option value="">すべてのステータス</option>
              <option value="APPROVED">運用中</option>
              <option value="SUSPENDED">停止中</option>
            </select>
            <Button type="submit">絞り込む</Button>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/admin/clubs">条件をクリア</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{hasFilters ? "表示中クラブ数" : "総クラブ数"}</p>
              <p className="text-2xl font-semibold text-foreground">{clubs.length}</p>
              {hasFilters ? (
                <p className="text-xs text-muted-foreground">全体 {totalClubCount} 件</p>
              ) : null}
            </div>
            <Building2 className="h-5 w-5 text-primary" aria-hidden />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">運用中</p>
              <p className="text-2xl font-semibold text-foreground">{statusCount.APPROVED ?? 0}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" aria-hidden />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">停止中</p>
              <p className="text-2xl font-semibold text-foreground">{statusCount.SUSPENDED ?? 0}</p>
            </div>
            <ShieldX className="h-5 w-5 text-red-600 dark:text-red-300" aria-hidden />
          </CardContent>
        </Card>
      </section>

      <Card padding="none">
        <CardHeader>
          <CardTitle>全クラブ一覧</CardTitle>
          <CardDescription>
            代表者・作成者・連絡先とステータスを一元管理できます。右端の操作から状態変更が可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-muted-foreground sm:px-5">
            <p>
              {clubs.length} 件表示
              {hasFilters ? <span> / 全 {totalClubCount} 件</span> : null}
            </p>
            {selectedStatus ? (
              <Badge variant="outline" className={statusBadgeClassMap[selectedStatus] ?? "border-border text-foreground"}>
                ステータス: {statusLabelMap[selectedStatus] ?? selectedStatus}
              </Badge>
            ) : null}
          </div>

          {clubs.length === 0 ? (
            <div className="px-4 pb-5 sm:px-5">
              <div className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                条件に一致するクラブがありません。
              </div>
            </div>
          ) : (
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[24%]">クラブ</TableHead>
                  <TableHead className="w-[18%]">代表者</TableHead>
                  <TableHead className="w-[18%]">作成者</TableHead>
                  <TableHead className="w-[10%] text-center">メンバー</TableHead>
                  <TableHead className="w-[12%]">登録日</TableHead>
                  <TableHead className="w-[10%]">ステータス</TableHead>
                  <TableHead className="sticky right-0 z-20 w-[18%] bg-muted/95 shadow-[-1px_0_0_0_hsl(var(--border))]">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clubs.map((club) => (
                  <TableRow key={club.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{club.name}</p>
                        <p className="text-xs text-muted-foreground">
                          設立年: {club.establishedYear ? `${club.establishedYear}年` : "未設定"}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">ID: {club.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {club.representativeUser ? (
                        <div className="space-y-0.5">
                          <p>{club.representativeUser.profile?.familyName ?? ""} {club.representativeUser.profile?.givenName ?? ""}</p>
                          <p className="font-mono text-xs text-muted-foreground">{club.representativeUser.email}</p>
                        </div>
                      ) : club.representativeFamilyName && club.representativeGivenName ? (
                        <div className="space-y-0.5">
                          <p>{club.representativeFamilyName} {club.representativeGivenName}</p>
                          <p className="text-xs text-muted-foreground">ユーザー未紐付け</p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {club.creator ? (
                        <div className="space-y-0.5">
                          <p>{club.creator.profile?.familyName ?? ""} {club.creator.profile?.givenName ?? ""}</p>
                          <p className="font-mono text-xs text-muted-foreground">{club.creator.email}</p>
                        </div>
                      ) : (
                        "不明"
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium text-foreground">
                      {club._count.memberships}名
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{formatDate(club.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClassMap[club.status] ?? "border-border text-foreground"}
                      >
                        {statusLabelMap[club.status] ?? club.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background shadow-[-1px_0_0_0_hsl(var(--border))]">
                      <ClubApprovalActions clubId={club.id} currentStatus={club.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
