import type { ComponentProps } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, Calendar, CircleCheck, MapPin, Users } from "lucide-react";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import { EntryDeadlineCountdown } from "@/components/competitions/EntryDeadlineCountdown";
import CompetitionEntryForm from "@/components/CompetitionEntryForm";
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import { getTeamMemberAssignmentWindowState } from "@/lib/teamMemberAssignmentWindow";
import { stripe } from "@/lib/stripe";
import { buildEntryCompletionReceipt } from "@/lib/entryCompletionReceipt";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { meetsEventAgeOrBirthRule } from "@/lib/eventBirthDateEligibility";

type CompetitionEntryFormProps = ComponentProps<typeof CompetitionEntryForm>;

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
    title: `エントリー | ${competition?.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { id } = await params;
  const { session_id: sessionIdFromUrl } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
          },
        },
      },
      events: {
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);

  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }

  let existingEntry = await prisma.competitionEntry.findFirst({
    where: {
      competitionId: competition.id,
      userId: session.userId,
      status: { in: ["SUBMITTED", "CANCELLED"] },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      items: true,
      snapshot: true,
      club: { select: { name: true } },
      checkoutSessions: {
        orderBy: { createdAt: "desc" },
      },
      participantStatuses: {
        select: {
          eventId: true,
          status: true,
          reason: true,
        },
      },
    },
  });

  /**
   * Webhook 未達・ローカルで stripe listen なし等でも、Stripe 上が paid なら DB を COMPLETED に揃えて UI を成立状態にする。
   */
  if (
    existingEntry?.status === "SUBMITTED" &&
    existingEntry.totalFee > 0
  ) {
    const pendingCheckout = existingEntry.checkoutSessions[0];
    if (
      pendingCheckout?.stripeCheckoutSessionId &&
      pendingCheckout.status !== "COMPLETED"
    ) {
      try {
        const stripeSession = await stripe.checkout.sessions.retrieve(
          pendingCheckout.stripeCheckoutSessionId
        );
        const finalized =
          await finalizeEntryCheckoutSessionsFromStripeSession(stripeSession);
        if (finalized.length > 0) {
          const refreshedSessions = await prisma.entryCheckoutSession.findMany({
            where: { entryId: existingEntry.id },
            orderBy: { createdAt: "desc" },
          });
          existingEntry = {
            ...existingEntry,
            checkoutSessions: refreshedSessions,
          };
        }
      } catch {
        // Stripe 未設定・API 失敗時は従来どおり Webhook 待ち表示へ
      }
    }
  }

  const formatDateTimeCompact = (date: Date) =>
    new Date(date).toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ja-JP").format(value);

  const hasTeamEvents = competition.events.some((event) => event.type === "TEAM");

  const renderEntryFee = (entryFee: unknown) => {
    if (entryFee === null || entryFee === undefined) {
      return <p className="text-xs font-medium">未設定</p>;
    }

    if (typeof entryFee === "number") {
      return <p className="text-xs font-medium">¥{formatCurrency(entryFee)}</p>;
    }

    if (typeof entryFee !== "object") {
      return <p className="text-xs font-medium">未設定</p>;
    }

    const fee = entryFee as {
      individualEntryFee?: number;
      teamEntryFeePerTeam?: number;
      baseFee?: number;
    };
    const individualFee = fee.individualEntryFee ?? fee.baseFee;
    const teamFee = fee.teamEntryFeePerTeam;

    return (
      <div className="space-y-px">
        {typeof individualFee === "number" && (
          <p className="text-xs font-medium">個人 ¥{formatCurrency(individualFee)}</p>
        )}
        {hasTeamEvents && typeof teamFee === "number" && (
          <p className="text-[11px] text-muted-foreground">チーム（1）¥{formatCurrency(teamFee)}</p>
        )}
        {typeof individualFee !== "number" && typeof teamFee !== "number" && (
          <p className="text-xs font-medium">未設定</p>
        )}
      </div>
    );
  };

  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const isEntryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;
  const entryStartISO = entryStart?.toISOString() ?? null;
  const entryEndISO = entryEnd?.toISOString() ?? null;
  const formattedEntryStart = entryStart ? formatDateTimeCompact(entryStart) : null;
  const formattedEntryEnd = entryEnd ? formatDateTimeCompact(entryEnd) : null;

  const competitionPeriodLabel = formatCompactJaDateRange(
    new Date(competition.startDate),
    competition.endDate ? new Date(competition.endDate) : null
  );

  const allowMultipleEventEntries = competition.allowMultipleEventEntries ?? true;
  const maxEventEntriesPerPerson =
    typeof competition.maxEventEntriesPerPerson === "number" &&
    competition.maxEventEntriesPerPerson > 0
      ? competition.maxEventEntriesPerPerson
      : null;
  const requireClubMembership = competition.requireClubMembership ?? false;

  const memberships = await prisma.membership.findMany({
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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      sex: true,
      dateOfBirth: true,
      qualifications: {
        where: { status: "APPROVED" },
        select: { kind: true },
      },
    },
  });

  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");

  const matchesQualification = (value: string, required: string) => {
    const normalizedValue = normalize(value);
    const normalizedRequired = normalize(required);
    if (!normalizedValue || !normalizedRequired) return false;
    return (
      normalizedValue === normalizedRequired ||
      normalizedValue.includes(normalizedRequired) ||
      normalizedRequired.includes(normalizedValue)
    );
  };

  const userAge = user?.dateOfBirth
    ? getCompetitionEligibilityAgeYears(
        new Date(user.dateOfBirth),
        new Date(competition.startDate)
      )
    : null;
  const userSex = user?.sex ?? "OTHER";
  const userQualifications = user?.qualifications.map((q) => q.kind) ?? [];

  const requiredQualifications = Array.isArray(competition.requiredQualifications)
    ? (competition.requiredQualifications as string[])
    : [];

  const meetsQualification = requiredQualifications.length === 0
    ? true
    : requiredQualifications.every((req) =>
        userQualifications.some((q) => matchesQualification(q, req))
      );

  const meetsCompetitionAge = (() => {
    if (userAge === null) return true;
    if (typeof competition.minAge === "number" && userAge < competition.minAge) return false;
    if (typeof competition.maxAge === "number" && userAge > competition.maxAge) return false;
    return true;
  })();

  const hasMembership = memberships.length > 0;
  const meetsClubRequirement = requireClubMembership ? hasMembership : true;
  const isCompetitionEligible = meetsQualification && meetsCompetitionAge && meetsClubRequirement;

  const eligibleEvents = competition.events.filter((event) => {
    if (!isCompetitionEligible) return false;
    if (event.type !== "INDIVIDUAL") return false;

    const isMixedEvent = event.sex === "OTHER";
    if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
      return false;
    }

    if (
      !meetsEventAgeOrBirthRule({
        userDateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth) : null,
        userEligibilityAgeYears: userAge,
        event,
      })
    ) {
      return false;
    }

    return true;
  });

  const missingQualificationLabels = requiredQualifications.filter(
    (req) => !userQualifications.some((q) => matchesQualification(q, req))
  );

  const eligibilityMessages: string[] = [];
  if (!meetsQualification) {
    if (missingQualificationLabels.length > 0) {
      eligibilityMessages.push(
        `次の資格を満たしていません: ${missingQualificationLabels.join("、")}`
      );
    } else {
      eligibilityMessages.push("参加に必要な資格を満たしていません。");
    }
  }
  if (!meetsCompetitionAge && userAge !== null) {
    if (typeof competition.minAge === "number" && userAge < competition.minAge) {
      eligibilityMessages.push(
        `大会の年齢下限は${competition.minAge}歳以上です（あなたの年齢は${userAge}歳。4月2日始まりの年度の末日＝翌年4月1日・日本時間時点の満年齢）。`
      );
    }
    if (typeof competition.maxAge === "number" && userAge > competition.maxAge) {
      eligibilityMessages.push(
        `大会の年齢上限は${competition.maxAge}歳以下です（あなたの年齢は${userAge}歳。4月2日始まりの年度の末日＝翌年4月1日・日本時間時点の満年齢）。`
      );
    }
  }
  if (!meetsClubRequirement) {
    eligibilityMessages.push(
      "所属クラブが必須ですが、承認済みのクラブがありません。"
    );
  }
  const canManageTeamEntries = memberships.some((membership) => isClubAdminRole(membership.role));
  const firstAdminMembership = memberships.find((m) => isClubAdminRole(m.role));
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
  const isTeamAssignmentWindowOpen = teamAssignmentWindow.open;

  const snapshot = existingEntry?.snapshot?.data as
    | {
        items?: { eventId?: string; entryTime?: string | null }[];
        teamEntries?: { eventId?: string; teamName?: string | null }[];
        notes?: string | null;
        clubId?: string | null;
      }
    | undefined;
  const latestCheckout = existingEntry?.checkoutSessions[0];
  const initialEntry = existingEntry
    ? {
        clubId: snapshot?.clubId ?? existingEntry.clubId,
        notes: snapshot?.notes ?? null,
        items: (Array.isArray(snapshot?.items) ? snapshot?.items : existingEntry.items)
          .map((item) => ({
            eventId: item.eventId,
            entryTime: item.entryTime ?? null,
          }))
          .filter(
            (item): item is { eventId: string; entryTime: string | null } =>
              typeof item.eventId === "string"
          ),
        teamEntries: Array.isArray(snapshot?.teamEntries)
          ? snapshot.teamEntries
              .map((item) => ({
                eventId: item.eventId ?? "",
                teamName: item.teamName ?? "",
              }))
              .filter((item) => item.eventId)
          : [],
        paymentStatus:
          latestCheckout?.status === "COMPLETED" || existingEntry.totalFee === 0
            ? ("PAID" as const)
            : ("UNPAID" as const),
      }
    : null;

  const awaitingDbPaymentConfirmation = Boolean(
    existingEntry &&
      existingEntry.status === "SUBMITTED" &&
      existingEntry.totalFee > 0 &&
      latestCheckout?.status !== "COMPLETED"
  );
  const unpaidContentLocked = awaitingDbPaymentConfirmation;

  /**
   * 未決済かつ Checkout 未完了の間は種目等をロック（主催管理者も一般参加者と同じ）。
   */
  let entryPaymentPhase: "awaiting_payment" | "confirming" | null = null;
  if (
    existingEntry &&
    existingEntry.status === "SUBMITTED" &&
    existingEntry.totalFee > 0 &&
    latestCheckout?.status !== "COMPLETED"
  ) {
    const stripeSessionId = latestCheckout?.stripeCheckoutSessionId;
    if (stripeSessionId) {
      try {
        const checkoutSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
        if (
          checkoutSession.payment_status === "paid" ||
          checkoutSession.payment_status === "no_payment_required"
        ) {
          entryPaymentPhase = "confirming";
        } else {
          entryPaymentPhase = "awaiting_payment";
        }
      } catch {
        entryPaymentPhase = "awaiting_payment";
      }
    } else {
      entryPaymentPhase = "awaiting_payment";
    }
  }

  const entryCancelled = existingEntry?.status === "CANCELLED";

  const entryUserFacing = existingEntry
    ? getEntryUserFacingStatus({
        status: existingEntry.status,
        totalFee: existingEntry.totalFee,
        checkoutSessions: existingEntry.checkoutSessions.map((s) => ({ status: s.status })),
      })
    : null;

  const entryEstablished = Boolean(
    existingEntry && entryUserFacing?.businessEstablished && !entryCancelled
  );

  const entryEventIds = existingEntry
    ? [...new Set(existingEntry.items.map((item) => item.eventId))]
    : [];
  const withdrawnForEntryEventIds = new Set(
    existingEntry?.participantStatuses
      .filter(
        (row) =>
          row.status === "DNS" &&
          typeof row.reason === "string" &&
          row.reason.includes("棄権")
      )
      .map((row) => row.eventId) ?? []
  );
  const fullyWithdrawnFromEntry =
    entryEventIds.length > 0 && entryEventIds.every((id) => withdrawnForEntryEventIds.has(id));
  const canRequestWithdraw = Boolean(
    existingEntry &&
      !entryCancelled &&
      entryEventIds.length > 0 &&
      !fullyWithdrawnFromEntry &&
      (competition.status === "PUBLISHED" || competition.status === "ONGOING")
  );
  const entryWithdrawAppliedCount = withdrawnForEntryEventIds.size;

  const pledgeMarkdown = (competition.entryPledgeText ?? "").trim();
  const entryPledgeActive =
    Boolean(competition.entryPledgeEnabled) && pledgeMarkdown.length > 0;
  const initialPledgeAccepted =
    Boolean(existingEntry?.pledgeAcceptedAt) &&
    entryPledgeActive &&
    (existingEntry?.pledgeTextSnapshot ?? "") === pledgeMarkdown;

  const entryReceipt = existingEntry
    ? buildEntryCompletionReceipt({
        competitionName: competition.name,
        requireClubMembership,
        events: competition.events.map((e) => ({
          id: e.id,
          name: e.name,
          sex: e.sex,
        })),
        entry: {
          id: existingEntry.id,
          status: existingEntry.status,
          totalFee: existingEntry.totalFee,
          items: existingEntry.items,
          snapshot: existingEntry.snapshot,
          checkoutSessions: existingEntry.checkoutSessions,
          club: existingEntry.club,
        },
        sessionIdFromUrl: sessionIdFromUrl ?? null,
      })
    : null;

  return (
    <div className="app-page mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
      <Card padding="none" className="border-border/80 shadow-sm">
        <CardHeader className="space-y-3 border-b border-border/60 bg-gradient-to-b from-muted/25 to-transparent px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal text-muted-foreground">
                  エントリー
                </Badge>
                {isCompetitionEligible ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-300/80 bg-emerald-50/80 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    要件クリア
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="font-normal">
                    要対応
                  </Badge>
                )}
              </div>
              <div>
                <CardTitle className="text-balance text-xl font-bold tracking-tight sm:text-2xl">
                  {competition.name}
                </CardTitle>
                {competition.nameKana ? (
                  <CardDescription className="mt-1 text-xs">{competition.nameKana}</CardDescription>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                <p className="text-xs font-medium text-foreground/80">
                  {competition.organization.name}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="tabular-nums">{competitionPeriodLabel}</span>
                  </span>
                  {competition.venue ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{competition.venue}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:self-start" asChild>
              <Link href={appRoutes.competitions.root(competition.id)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                大会ページへ
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <EntryDeadlineCountdown
            entryStartISO={entryStartISO}
            entryEndISO={entryEndISO}
            formattedStart={formattedEntryStart}
            formattedEnd={formattedEntryEnd}
          />
          <div
            className={`rounded-lg border px-3 py-3 sm:px-4 sm:py-3.5 ${
              isCompetitionEligible
                ? "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/45 dark:bg-emerald-950/25"
                : "border-red-200/80 bg-red-50/50 dark:border-red-900/45 dark:bg-red-950/20"
            }`}
          >
            <p className="text-xs font-semibold text-foreground">エントリー資格</p>
            {isCompetitionEligible ? (
              <div className="mt-2 flex gap-2 text-sm">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="leading-snug text-foreground">資格要件を満たしています。種目を選んで手続きを進められます。</p>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-medium leading-snug text-foreground">資格要件を満たしていません。</p>
                    <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                      {eligibilityMessages.map((message, index) => (
                        <li key={`${message}-${index}`}>{message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {!meetsQualification ? (
                  <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
                    登録資格:{" "}
                    {userQualifications.length > 0 ? userQualifications.join("、") : "なし"}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {hasTeamEvents ? (
        <Card padding="none" className="border-border/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">チーム種目</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {isTeamAssignmentWindowOpen
                    ? "メンバー割当はエントリー終了後から可能です。クラブ管理者は各チームのスタートリスト上のヒートのマーシャル締切まで編集でき、スタートリスト設定の目安日時は通知用です。"
                    : "チーム種目の登録・管理はクラブ管理者が行います。エントリー終了後は上記のとおりメンバー割当が可能になります。"}
                </p>
              </div>
            </div>
            {canManageTeamEntries ? (
              isTeamAssignmentWindowOpen ? (
                <Button variant="outline" size="sm" className="h-9 w-full shrink-0 px-4 text-xs sm:w-auto" asChild>
                  <Link
                    href={
                      firstAdminMembership
                        ? appRoutes.clubs.competition.team(firstAdminMembership.club.id, competition.id, {
                            tab: "assignment",
                          })
                        : appRoutes.competitions.legacyTeamAssignment(competition.id)
                    }
                  >
                    メンバー割当へ
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-9 w-full shrink-0 px-4 text-xs sm:w-auto" asChild>
                  <Link
                    href={
                      firstAdminMembership
                        ? appRoutes.clubs.competition.team(firstAdminMembership.club.id, competition.id, {
                            tab: "entry",
                          })
                        : appRoutes.competitions.legacyTeamEntry(competition.id)
                    }
                  >
                    チーム管理へ
                  </Link>
                </Button>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <CompetitionEntryForm
        competitionId={competition.id}
        events={eligibleEvents}
        memberships={memberships}
        entryWindowOpen={isEntryWindowOpen}
        entryFee={competition.entryFee as unknown as CompetitionEntryFormProps["entryFee"]}
        entryFeeSummary={renderEntryFee(competition.entryFee)}
        allowMultipleEventEntries={allowMultipleEventEntries}
        maxEventEntriesPerPerson={maxEventEntriesPerPerson}
        requireClubMembership={requireClubMembership}
        isEligible={isCompetitionEligible}
        initialEntry={initialEntry}
        lockEntryContentUntilPaid={unpaidContentLocked}
        entryPaymentPhase={entryPaymentPhase}
        entryReceipt={entryReceipt}
        entryCancelled={entryCancelled}
        entryEstablished={entryEstablished}
        entryIdForActions={existingEntry?.id ?? null}
        canRequestWithdraw={canRequestWithdraw}
        entryWithdrawAppliedCount={entryWithdrawAppliedCount}
        entryPledge={
          entryPledgeActive
            ? { markdown: pledgeMarkdown, initialAccepted: initialPledgeAccepted }
            : null
        }
      />
    </div>
  );
}
