import type { ComponentProps } from "react";
import type Stripe from "stripe";
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
import {
  formatAdminWallClockSameAsDatetimeLocal,
  formatCompactJaDateRange,
} from "@/lib/datetimeLocal";
import { EntryDeadlineCountdown } from "@/components/competitions/EntryDeadlineCountdown";
import CompetitionEntryForm from "@/components/CompetitionEntryForm";
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import { getTeamMemberAssignmentWindowState } from "@/lib/teamMemberAssignmentWindow";
import { stripe } from "@/lib/stripe";
import { buildEntryCompletionReceipt } from "@/lib/entryCompletionReceipt";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  isTieredEntryFee,
  isTieredRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  parseUnderFeeTiers,
  parseUnderQualificationTiers,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
} from "@/lib/competitionEntryAgeTiered";
import {
  competitionUsesUnderAgeSystem,
  partitionUnderBandsForCompetition,
} from "@/lib/competitionUnderAgeSettings";
import { meetsCompetitionEventAgeEligibility } from "@/lib/underAgeEventEligibility";

type CompetitionEntryFormProps = ComponentProps<typeof CompetitionEntryForm>;

/** エントリーページの RSC が Stripe 待ちで長時間ブロックしないよう、取得だけ短めに打ち切る */
const ENTRY_PAGE_STRIPE_RETRIEVE_MS = 7000;

/** NFKC は孤立サロゲート等で RangeError になり得るため、比較用途では握りつぶす */
function safeNormalizeComparable(value: string | null | undefined): string {
  const raw = value ?? "";
  try {
    return raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");
  }
}

async function retrieveCheckoutSessionForEntryPage(
  sessionId: string
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await Promise.race([
      stripe.checkout.sessions.retrieve(sessionId),
      new Promise<Stripe.Checkout.Session>((_, reject) => {
        setTimeout(
          () => reject(new Error("stripe_retrieve_timeout")),
          ENTRY_PAGE_STRIPE_RETRIEVE_MS
        );
      }),
    ]);
  } catch {
    return null;
  }
}

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
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawSessionId = sp.session_id;
  const sessionIdFromUrl =
    typeof rawSessionId === "string"
      ? rawSessionId
      : Array.isArray(rawSessionId)
        ? rawSessionId[0]
        : undefined;
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
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          displayOrder: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
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
    if (pendingCheckout?.stripeCheckoutSessionId && pendingCheckout.status === "PENDING") {
      try {
        const stripeSession = await retrieveCheckoutSessionForEntryPage(
          pendingCheckout.stripeCheckoutSessionId
        );
        if (!stripeSession) {
          throw new Error("stripe_unavailable");
        }
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ja-JP").format(value);

  const hasTeamEvents = competition.events.some((event) => event.type === "TEAM");
  const hasIndividualEvents = competition.events.some((event) => event.type === "INDIVIDUAL");

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

    const catTiers = parseAgeCategoryFeeTiers(entryFee);
    if (catTiers?.length && competition.ageCategories?.length) {
      const nameById = new Map(competition.ageCategories.map((c) => [c.id, c.name]));
      return (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">
            年齢カテゴリ別（生年月日の区分）
          </p>
          {catTiers.map((t, i) => (
            <p key={i} className="text-xs font-medium leading-snug">
              {nameById.get(t.ageCategoryId) ?? "区分"}
              {hasIndividualEvents ? (
                <>
                  {" "}
                  · 個人 ¥{formatCurrency(t.individualEntryFee)}
                </>
              ) : null}
              {hasTeamEvents ? (
                <>
                  {" "}
                  · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}
                </>
              ) : null}
            </p>
          ))}
        </div>
      );
    }

    const underTiers = parseUnderFeeTiers(entryFee);
    if (underTiers?.length) {
      return (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">
            アンダー区分別（年度年齢・U/OPEN）
          </p>
          {underTiers.map((t, i) => (
            <p key={i} className="text-xs font-medium leading-snug">
              {t.tierKey}
              {hasIndividualEvents ? (
                <>
                  {" "}
                  · 個人 ¥{formatCurrency(t.individualEntryFee)}
                </>
              ) : null}
              {hasTeamEvents ? (
                <>
                  {" "}
                  · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}
                </>
              ) : null}
            </p>
          ))}
        </div>
      );
    }

    const tiers = parseAgeFeeTiers(entryFee);
    if (tiers) {
      return (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">
            年齢帯別（開催日時点の満年齢）
          </p>
          {tiers.map((t, i) => (
            <p key={i} className="text-xs font-medium leading-snug">
              {t.minAge}歳〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
              {hasIndividualEvents ? (
                <>
                  {" "}
                  · 個人 ¥{formatCurrency(t.individualEntryFee)}
                </>
              ) : null}
              {hasTeamEvents ? (
                <>
                  {" "}
                  · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}
                </>
              ) : null}
            </p>
          ))}
        </div>
      );
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
  const formattedEntryStart = entryStart
    ? formatAdminWallClockSameAsDatetimeLocal(entryStart)
    : null;
  const formattedEntryEnd = entryEnd ? formatAdminWallClockSameAsDatetimeLocal(entryEnd) : null;

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

  const matchesQualification = (value: string, required: string) => {
    const normalizedValue = safeNormalizeComparable(value);
    const normalizedRequired = safeNormalizeComparable(required);
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
  const underPartition = partitionUnderBandsForCompetition(competition);
  const userSex = user?.sex ?? "OTHER";
  const userQualifications = user?.qualifications?.map((q) => q.kind) ?? [];

  const rq = resolveRequiredQualificationsForAge(
    competition.requiredQualifications,
    userAge,
    { underPartition: underPartition ?? null }
  );
  const meetsQualification =
    !rq.tierMissing &&
    (rq.list.length === 0
      ? true
      : rq.list.every((req) =>
          userQualifications.some((q) => matchesQualification(q, req))
        ));

  const userDob = user?.dateOfBirth ? new Date(user.dateOfBirth) : null;
  const feeResolution = resolveEntryFeeUnits(competition.entryFee, userAge, {
    userDateOfBirth: userDob,
    competitionAgeCategories: competition.ageCategories,
    underFeePartition: underPartition ?? null,
  });
  const meetsFeeAgeTier =
    !isTieredEntryFee(competition.entryFee) || !feeResolution.ageTierMissing;

  const meetsCompetitionAge = (() => {
    if (userAge === null) return true;
    if (typeof competition.minAge === "number" && userAge < competition.minAge) return false;
    if (typeof competition.maxAge === "number" && userAge > competition.maxAge) return false;
    return true;
  })();

  const hasMembership = memberships.length > 0;
  const meetsClubRequirement = requireClubMembership ? hasMembership : true;
  const isCompetitionEligible =
    meetsQualification &&
    meetsCompetitionAge &&
    meetsClubRequirement &&
    meetsFeeAgeTier;

  const eligibleEvents = competition.events.filter((event) => {
    if (!isCompetitionEligible) return false;
    if (event.type !== "INDIVIDUAL") return false;

    const isMixedEvent = event.sex === "OTHER";
    if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
      return false;
    }

    if (
      !meetsCompetitionEventAgeEligibility({
        competitionUnderAgeEnabled: competitionUsesUnderAgeSystem(competition),
        underPartition,
        eventUnderAgeEligibilityEnabled: event.underAgeEligibilityEnabled ?? true,
        event,
        userDateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth) : null,
        seasonalAgeYears: userAge,
      })
    ) {
      return false;
    }

    return true;
  });

  const missingQualificationLabels = rq.list.filter(
    (req) => !userQualifications.some((q) => matchesQualification(q, req))
  );

  const eligibilityMessages: string[] = [];
  if (!meetsQualification) {
    if (rq.tierMissing && isTieredRequiredQualifications(competition.requiredQualifications)) {
      const isUnderQual = parseUnderQualificationTiers(competition.requiredQualifications) !== null;
      eligibilityMessages.push(
        userAge === null
          ? isUnderQual
            ? "この大会はアンダー区分ごとの出場資格が設定されています。プロフィールに生年月日を登録してください。"
            : "この大会は年齢帯ごとの出場資格が設定されています。プロフィールに生年月日を登録してください。"
          : isUnderQual
            ? "出場資格のアンダー区分に、あなたの年度年齢が該当する区分がありません。主催者へお問い合わせください。"
            : "出場資格の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
      );
    } else if (missingQualificationLabels.length > 0) {
      eligibilityMessages.push(
        `次の資格を満たしていません: ${missingQualificationLabels.join("、")}`
      );
    } else {
      eligibilityMessages.push("参加に必要な資格を満たしていません。");
    }
  }
  if (!meetsFeeAgeTier) {
    const isUnderFee = parseUnderFeeTiers(competition.entryFee) !== null;
    eligibilityMessages.push(
      userAge === null
        ? isUnderFee
          ? "この大会はアンダー区分別の参加費です。プロフィールに生年月日を登録してください。"
          : "この大会は年齢帯別の参加費です。プロフィールに生年月日を登録してください。"
        : isUnderFee
          ? "参加費のアンダー区分に、あなたの年度年齢が該当する区分がありません。主催者へお問い合わせください。"
          : "参加費の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
    );
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
          isEntryCheckoutPaidForEligibility(latestCheckout?.status) || existingEntry.totalFee === 0
            ? ("PAID" as const)
            : ("UNPAID" as const),
      }
    : null;

  const checkoutPaidLike = isEntryCheckoutPaidForEligibility(latestCheckout?.status);
  const awaitingDbPaymentConfirmation = Boolean(
    existingEntry &&
      existingEntry.status === "SUBMITTED" &&
      existingEntry.totalFee > 0 &&
      !checkoutPaidLike &&
      latestCheckout?.status !== "DISPUTE_LOST"
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
    !checkoutPaidLike &&
    latestCheckout?.status !== "DISPUTE_LOST"
  ) {
    const stripeSessionId = latestCheckout?.stripeCheckoutSessionId;
    if (stripeSessionId) {
      try {
        const checkoutSession = await retrieveCheckoutSessionForEntryPage(stripeSessionId);
        if (!checkoutSession) {
          entryPaymentPhase = "awaiting_payment";
        } else if (
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
    (existingEntry?.participantStatuses ?? [])
      .filter(
        (row) =>
          row.status === "DNS" &&
          typeof row.reason === "string" &&
          row.reason.includes("棄権")
      )
      .map((row) => row.eventId)
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
        userAgeYearsAtCompetitionStart={userAge}
        userDateOfBirthISO={user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString() : null}
        feeAgeCategories={competition.ageCategories.map((c) => ({
          id: c.id,
          name: c.name,
          displayOrder: c.displayOrder,
          eligibleBirthDateFrom: c.eligibleBirthDateFrom
            ? new Date(c.eligibleBirthDateFrom).toISOString()
            : null,
          eligibleBirthDateTo: c.eligibleBirthDateTo
            ? new Date(c.eligibleBirthDateTo).toISOString()
            : null,
        }))}
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
        underAgeFeeBands={
          competition.underAgeSystemEnabled
            ? {
                uThresholds: [...(competition.underAgeUThresholds ?? [])],
                openEnabled: competition.underAgeOpenEnabled ?? true,
              }
            : null
        }
      />
    </div>
  );
}
