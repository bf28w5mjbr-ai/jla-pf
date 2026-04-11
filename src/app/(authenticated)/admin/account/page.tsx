import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Landmark, LayoutDashboard, ShieldAlert } from "lucide-react";
import { isPfOrAccAdmin, verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { findManyPendingCsvExportRequestsForPfAdmin } from "@/lib/competitionEntryCsvExport";
import type { PendingCsvExportRequestRow } from "@/components/admin/EntryCsvExportRequestsAdminPanel";
import type { PendingCompetitionTypeApplicationRow } from "@/components/admin/CompetitionTypeApplicationsAdminPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AccountAdminTabs, { type AccountAdminTabValue } from "@/components/admin/AccountAdminTabs";
import AssociationAccountTab from "@/components/admin/AssociationAccountTab";
import HostOrganizerAccountTab from "@/components/admin/HostOrganizerAccountTab";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "アカウント管理 | Bluvium",
};

export default async function AccountAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const initialTab: AccountAdminTabValue = sp.tab === "host" ? "host" : "association";

  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect("/login");
  }

  if (!(await isPfOrAccAdmin(sess.userId))) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16 lg:py-24">
        <Card className="w-full overflow-hidden border-border/90 text-center shadow-sm">
          <CardContent className="space-y-5 px-6 pt-12 pb-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldAlert className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">アクセスできません</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                アカウント管理を利用するには、協会管理者またはプラットフォーム管理者の権限が必要です。
              </p>
            </div>
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href="/dashboard">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                ダッシュボードへ戻る
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });

  const isPfAdmin = currentUser?.role === "PF_ADMIN";

  const [pendingQualificationCount, userCount, clubCount, applyingClubCount, associations, hostOrganizations] =
    await prisma.$transaction([
      prisma.qualification.count({ where: { status: "PENDING" } }),
      prisma.user.count(),
      prisma.club.count(),
      prisma.club.count({ where: { status: "APPLYING" } }),
      prisma.association.findMany({
        where: isPfAdmin
          ? undefined
          : {
              admins: {
                some: {
                  userId: sess.userId,
                },
              },
            },
        orderBy: [{ createdAt: "desc" }, { name: "asc" }],
        include: {
          admins: {
            orderBy: [{ createdAt: "asc" }],
            include: {
              user: {
                select: {
                  id: true,
                  familyName: true,
                  givenName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.organization.findMany({
        where: isPfAdmin
          ? {}
          : {
              admins: {
                some: { userId: sess.userId },
              },
            },
        orderBy: [{ name: "asc" }],
        take: isPfAdmin ? 200 : undefined,
        include: {
          admins: {
            orderBy: [{ createdAt: "asc" }],
            include: {
              user: {
                select: {
                  id: true,
                  familyName: true,
                  givenName: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: { competitions: true },
          },
        },
      }),
    ]);

  let pendingCsvExportRows: PendingCsvExportRequestRow[] = [];
  let pendingCompetitionTypeApplicationRows: PendingCompetitionTypeApplicationRow[] = [];
  if (isPfAdmin) {
    const [pendingCsv, pendingCompetitionTypeApplications] = await Promise.all([
      findManyPendingCsvExportRequestsForPfAdmin(),
      prisma.competitionTypeApplication.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: {
          competition: {
            select: {
              name: true,
              organization: { select: { name: true } },
            },
          },
          requestedBy: {
            select: {
              familyName: true,
              givenName: true,
              email: true,
            },
          },
        },
      }),
    ]);
    pendingCsvExportRows = pendingCsv.map((r) => ({
      id: r.id,
      scope: r.scope,
      createdAt: r.createdAt.toISOString(),
      competitionName: r.competition.name,
      organizationName: r.competition.organization.name,
      requesterLabel: `${r.requestedBy.familyName} ${r.requestedBy.givenName}`,
      requesterEmail: r.requestedBy.email,
    }));
    pendingCompetitionTypeApplicationRows = pendingCompetitionTypeApplications.map((r) => ({
      id: r.id,
      requestedType: r.requestedType,
      createdAt: r.createdAt.toISOString(),
      competitionName: r.competition.name,
      organizationName: r.competition.organization.name,
      requesterLabel: `${r.requestedBy.familyName} ${r.requestedBy.givenName}`,
      requesterEmail: r.requestedBy.email,
    }));
  }

  return (
    <div className="app-page mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header className="space-y-5 border-b border-border/80 pb-6 sm:pb-8">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={isPfAdmin ? "default" : "secondary"}
                className="font-normal"
              >
                {isPfAdmin ? "PF管理者" : "協会管理者"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <Landmark className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="text-sm font-medium">アカウント管理</span>
            </div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              運営ダッシュボード
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              協会の審査・指標と、大会主催者（主催団体）の状況をタブで切り替えて確認できます。
            </p>
          </div>
          {isPfAdmin ? (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <Link href="/associations/create">
                  協会を作成
                  <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="rounded-2xl border border-border/80 bg-muted/15 p-3.5 shadow-sm sm:p-5">
        <AccountAdminTabs
          key={initialTab}
          initialTab={initialTab}
          associationContent={
            <AssociationAccountTab
              isPfAdmin={isPfAdmin}
              pendingQualificationCount={pendingQualificationCount}
              userCount={userCount}
              clubCount={clubCount}
              applyingClubCount={applyingClubCount}
              associations={associations}
            />
          }
          hostContent={
            <HostOrganizerAccountTab
              organizations={hostOrganizations}
              isPfAdmin={isPfAdmin}
              pendingCsvExportRequests={pendingCsvExportRows}
              pendingCompetitionTypeApplications={pendingCompetitionTypeApplicationRows}
            />
          }
        />
      </div>
    </div>
  );
}
