import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequiredAuthenticatedUserId, verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { ArrowLeft, AlertTriangle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import StartListConfigurator from "@/components/admin/StartListConfigurator";
import CompetitionTeamBillingManager from "@/components/admin/CompetitionTeamBillingManager";
import CompetitionEntryAdminActions from "@/components/admin/CompetitionEntryAdminActions";
import { getCompetitionManagementAccess } from "@/lib/competitionManagementAccess";
import {
  parseTeamEntryPaymentMetadata,
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
} from "@/lib/teamEntryPayments";
import {
  getAdminEntryLifecycleStateLabel,
  getIndividualEventIdsFromEntry,
  hasIndividualWithdrawalForEvent,
} from "@/lib/entryWithdrawalAdminLabel";
import SimpleMarkdown from "@/components/SimpleMarkdown";
import { getMergedEventIdsFromEntry } from "@/lib/competitionEntryMergedEventIds";
import {
  orderedLabelsForMergedEventIds,
  sortEventsForEntryExport,
} from "@/lib/competitionEntryExportOrdering";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}): Promise<Metadata> {
  const { id: organizationId, competitionId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  const genericTitle = { title: "エントリー状況 | 大会 | Bluvium" };
  if (!session?.userId) {
    return genericTitle;
  }

  const access = await getCompetitionManagementAccess(
    organizationId,
    competitionId,
    session.userId
  );

  if (access.kind !== "ok") {
    return genericTitle;
  }

  return {
    title: `エントリー状況 | ${access.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionEntriesPage({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}) {
  const { id: organizationId, competitionId } = await params;
  const userId = await getRequiredAuthenticatedUserId();

  const access = await getCompetitionManagementAccess(
    organizationId,
    competitionId,
    userId
  );
  if (access.kind === "not_found") {
    notFound();
  }
  if (access.kind === "wrong_org" || access.kind === "forbidden") {
    redirect(`/organizations/${organizationId}`);
  }

  const competitionPromise = prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      requireClubMembership: true,
      entryPledgeEnabled: true,
      entryEndDate: true,
      entryFee: true,
      ageCategories: {
        select: { id: true, name: true, displayOrder: true },
        orderBy: { displayOrder: "asc" },
      },
      events: {
        select: {
          id: true,
          name: true,
          sex: true,
          type: true,
          displayOrder: true,
          ageCategoryId: true,
          ageCategory: {
            select: { id: true, name: true },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
      startListSettings: true,
    },
  });

  const competition = await competitionPromise;

  if (!competition || competition.organizationId !== organizationId) {
    notFound();
  }

  const programOrderedEvents = sortEventsForEntryExport(
    competition.events,
    competition.ageCategories
  );

  const [entries, teamEntries] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId: competition.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { familyName: true, givenName: true } },
            contact: { select: { phoneNumber: true } },
          },
        },
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        checkoutSessions: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        items: {
          include: {
            event: {
              select: {
                id: true,
                name: true,
                sex: true,
              },
            },
          },
        },
        snapshot: true,
        participantStatuses: {
          select: { eventId: true, status: true, reason: true },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teamEntry.findMany({
      where: {
        competitionId: competition.id,
      },
      include: {
        club: {
          select: {
            name: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                profile: { select: { familyName: true, givenName: true } },
              },
            },
          },
        },
        event: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const teamPaymentOwnerIds = Array.from(
    new Set(teamEntries.map((entry) => buildTeamEntryPaymentOwnerId(competition.id, entry.clubId)))
  );
  const prepaidPaymentOwnerIds = Array.from(
    new Set(teamEntries.map((entry) => buildClubPrepaidIndividualPaymentOwnerId(competition.id, entry.clubId)))
  );
  const allClubEntryOwnerIds = [...new Set([...teamPaymentOwnerIds, ...prepaidPaymentOwnerIds])];
  const teamPayments = allClubEntryOwnerIds.length
    ? await prisma.payment.findMany({
        where: {
          ownerType: "CLUB",
          ownerId: {
            in: allClubEntryOwnerIds,
          },
          type: "COMPETITION_ENTRY_FEE",
        },
        select: {
          ownerId: true,
          status: true,
          amount: true,
          metadata: true,
          paidAt: true,
        },
      })
    : [];

  const totalEntries = entries.length;
  const paidEntries = entries.filter((entry) => {
    if (entry.totalFee === 0) return true;
    const sessionRecord = entry.checkoutSessions[0];
    return isEntryCheckoutPaidForEligibility(sessionRecord?.status);
  }).length;

  const openDisputeEntryCount = entries.filter((entry) => {
    if (entry.status === "CANCELLED" || entry.totalFee === 0) return false;
    return entry.checkoutSessions.some((s) => s.status === "DISPUTED");
  }).length;

  const individualByEvent = new Map<string, { name: string; clubName: string | null }[]>();
  entries.forEach((entry) => {
    entry.items.forEach((item) => {
      const eventId = item.eventId;
      if (hasIndividualWithdrawalForEvent(entry.participantStatuses, eventId)) return;
      const list = individualByEvent.get(eventId) ?? [];
      list.push({
        name: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
        clubName: entry.club?.name ?? null,
      });
      individualByEvent.set(eventId, list);
    });
  });

  const teamByEvent = new Map<
    string,
    { teamName: string; clubName?: string | null; members: string[] }[]
  >();
  teamEntries.forEach((teamEntry) => {
    const eventId = teamEntry.eventId;
    const list = teamByEvent.get(eventId) ?? [];
    list.push({
      teamName: teamEntry.teamName,
      clubName: teamEntry.club?.name ?? null,
      members: teamEntry.members
        .map((member) => `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim())
        .filter(Boolean),
    });
    teamByEvent.set(eventId, list);
  });

  const individualByEventObject = Object.fromEntries(individualByEvent.entries());
  const teamByEventObject = Object.fromEntries(teamByEvent.entries());
  const teamEntryFeePerTeam =
    competition.entryFee &&
    typeof competition.entryFee === "object" &&
    typeof (competition.entryFee as { teamEntryFeePerTeam?: unknown }).teamEntryFeePerTeam === "number"
      ? ((competition.entryFee as { teamEntryFeePerTeam?: number }).teamEntryFeePerTeam ?? 0)
      : 0;
  const teamBillingMap = new Map<
    string,
    {
      clubId: string;
      clubName: string;
      teamCount: number;
      teamAmount: number;
      teamStatus: string | null;
      prepaidAmount: number;
      prepaidStatus: string | null;
      finalizedAt: string | null;
      paidAt: string | null;
    }
  >();
  teamEntries.forEach((teamEntry) => {
    const teamOwnerId = buildTeamEntryPaymentOwnerId(competition.id, teamEntry.clubId);
    const prepaidOwnerId = buildClubPrepaidIndividualPaymentOwnerId(competition.id, teamEntry.clubId);
    const teamPayment = teamPayments.find((item) => item.ownerId === teamOwnerId);
    const prepaidPayment = teamPayments.find((item) => item.ownerId === prepaidOwnerId);
    const existing = teamBillingMap.get(teamEntry.clubId);
    const teamMeta = parseTeamEntryPaymentMetadata(teamPayment?.metadata);
    const prepaidMeta = parseTeamEntryPaymentMetadata(prepaidPayment?.metadata);
    const finalizedAt =
      teamMeta.finalizedAt ??
      prepaidMeta.finalizedAt ??
      existing?.finalizedAt ??
      null;
    const paidAt =
      teamPayment?.paidAt?.toISOString() ??
      prepaidPayment?.paidAt?.toISOString() ??
      existing?.paidAt ??
      null;
    teamBillingMap.set(teamEntry.clubId, {
      clubId: teamEntry.clubId,
      clubName: teamEntry.club?.name ?? "クラブ不明",
      teamCount: (existing?.teamCount ?? 0) + 1,
      teamAmount: teamPayment?.amount ?? ((existing?.teamCount ?? 0) + 1) * teamEntryFeePerTeam,
      teamStatus: teamPayment?.status ?? null,
      prepaidAmount: prepaidPayment?.amount ?? 0,
      prepaidStatus: prepaidPayment?.status ?? null,
      finalizedAt,
      paidAt,
    });
  });
  const teamBills = Array.from(teamBillingMap.values()).sort((a, b) =>
    a.clubName.localeCompare(b.clubName, "ja")
  );
  const now = new Date();
  const canFinalizeTeamBills = Boolean(
    competition.entryEndDate && now > new Date(competition.entryEndDate)
  );

  const eventMap = new Map<string, { id: string; name: string; sex?: string | null }>(
    Array.isArray(competition.events)
      ? competition.events.map((event) => [event.id, event])
      : []
  );

  const formatEventLabel = (event: { name: string; sex?: string | null } | undefined) => {
    if (!event) return "種目不明";
    const sexLabel = event.sex === "MALE" ? "男子" : event.sex === "FEMALE" ? "女子" : "混合";
    return `${event.name}（${sexLabel}）`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>エントリー状況</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {competition.name} のエントリー状況を確認できます。
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-200">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 dark:border-gray-700 dark:bg-gray-900">
              総エントリー数: {totalEntries}件
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 dark:border-gray-700 dark:bg-gray-900">
              決済完了: {paidEntries}件
            </span>
          </div>
          {openDisputeEntryCount > 0 ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                カード決済の異議申し立て（チャージバック）が付いているエントリーが{" "}
                {openDisputeEntryCount} 件あります。証拠提出や対応が必要な場合は Stripe
                ダッシュボード（プラットフォーム／Connect の該当アカウント）を確認してください。
              </p>
            </div>
          ) : null}
          <div>
            <Link href={`/organizations/${organizationId}/competitions/${competitionId}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                大会ページへ戻る
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>エントリー一覧</CardTitle>
        </CardHeader>
        <CardContent>
            {entries.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                まだエントリーがありません。
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((entry) => {
                  const individualEventIds = getIndividualEventIdsFromEntry(entry);
                  const lifecycleState = getAdminEntryLifecycleStateLabel({
                    entryStatus: entry.status,
                    entryEventIds: individualEventIds,
                    participantStatuses: entry.participantStatuses,
                  });
                  const checkout = entry.checkoutSessions[0];
                  const payload =
                    checkout?.payload && typeof checkout.payload === "object"
                      ? (checkout.payload as Record<string, unknown>)
                      : null;
                  const paymentStatus = entry.status === "CANCELLED"
                    ? {
                        label:
                          typeof payload?.refundedAt === "string" || entry.totalFee === 0
                            ? "返金 / 取消済み"
                            : "取消済み",
                        icon: CheckCircle2,
                        color: "text-gray-500",
                      }
                    : entry.totalFee === 0
                      ? { label: "決済不要", icon: CheckCircle2, color: "text-emerald-600" }
                      : checkout?.status === "DISPUTE_LOST"
                        ? {
                            label: "決済無効（異議・返金）",
                            icon: AlertTriangle,
                            color: "text-red-600 dark:text-red-400",
                          }
                        : checkout?.status === "DISPUTED"
                          ? {
                              label: "決済完了（異議申し立て中）",
                              icon: AlertTriangle,
                              color: "text-amber-600 dark:text-amber-400",
                            }
                          : isEntryCheckoutPaidForEligibility(checkout?.status)
                            ? { label: "決済完了", icon: CheckCircle2, color: "text-emerald-600" }
                            : { label: "決済確認中", icon: Clock, color: "text-gray-500" };
                  const StatusIcon = paymentStatus.icon;

                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {entry.user.profile?.familyName ?? ""} {entry.user.profile?.givenName ?? ""}
                          </p>
                          <p className="text-sm text-gray-500">受付日: {new Date(entry.createdAt).toLocaleDateString("ja-JP")}</p>
                          <p className="text-sm text-gray-500">状態: {lifecycleState}</p>
                          {entry.pledgeAcceptedAt ? (
                            <details className="group mt-3 max-w-xl rounded-lg border border-border bg-card text-sm shadow-sm transition-colors open:border-primary/30 dark:border-gray-700 dark:bg-gray-900/30">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-gray-800 outline-none marker:content-none dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                                <span className="text-sm font-medium">誓約の記録</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                                    {new Date(entry.pledgeAcceptedAt).toLocaleString("ja-JP", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
                                </span>
                              </summary>
                              <div className="border-t border-border px-3 py-3 text-xs leading-relaxed dark:border-gray-700">
                                <div className="rounded-md border border-border/60 bg-muted/25 p-3 dark:bg-gray-950/50">
                                  <SimpleMarkdown text={entry.pledgeTextSnapshot ?? ""} />
                                </div>
                              </div>
                            </details>
                          ) : competition.entryPledgeEnabled ? (
                            <p className="mt-2 text-xs text-amber-800/90 dark:text-amber-200/90">
                              誓約記録なし（移行前のエントリー等）
                            </p>
                          ) : null}
                          {competition.requireClubMembership && entry.club && (
                            <p className="text-sm text-gray-500">所属クラブ: {entry.club.name}</p>
                          )}
                          <div className="text-sm text-gray-500">
                            <p>エントリー種目:</p>
                            {(() => {
                              const merged = getMergedEventIdsFromEntry(entry);
                              const labels = orderedLabelsForMergedEventIds(
                                programOrderedEvents,
                                merged,
                                (id) => formatEventLabel(eventMap.get(id))
                              );

                              if (labels.length === 0) {
                                return <p className="text-sm text-gray-500">未登録</p>;
                              }

                              return (
                                <ul className="mt-1 space-y-1">
                                  {labels.map((label, index) => (
                                    <li key={`${label}-${index}`} className="text-sm">
                                      {label}
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                          <p className="font-medium">参加費: ¥{entry.totalFee.toLocaleString()}</p>
                          <div className="mt-2 flex items-center gap-2 justify-end">
                            <StatusIcon className={`h-4 w-4 ${paymentStatus.color}`} />
                            <span>{paymentStatus.label}</span>
                          </div>
                          <div className="mt-2 text-xs text-gray-500">
                            {entry.user.email}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.user.contact?.phoneNumber}
                          </div>
                          <div className="mt-3">
                            <CompetitionEntryAdminActions
                              competitionId={competition.id}
                              entryId={entry.id}
                              disabled={entry.status === "CANCELLED"}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>チーム請求</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionTeamBillingManager
            competitionId={competition.id}
            bills={teamBills}
            canFinalize={canFinalizeTeamBills}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>スタートリスト</CardTitle>
        </CardHeader>
        <CardContent>
          <StartListConfigurator
            competitionId={competition.id}
            events={programOrderedEvents}
            individualByEvent={individualByEventObject}
            teamByEvent={teamByEventObject}
            initialSettings={competition.startListSettings ?? undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
