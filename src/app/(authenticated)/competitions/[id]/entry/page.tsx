import type { ComponentProps } from "react";
import type Stripe from "stripe";
import { Metadata } from "next";
import Link from "next/link";

import { redirect, notFound } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { competitionMetadataTitle } from "@/lib/competitionMetadata";
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
import { AlertCircle, ArrowLeft, Calendar, CircleCheck, MapPin, User, UsersRound } from "lucide-react";
import {
  formatAdminWallClockSameAsDatetimeLocal,
  formatCompactJaDateRange,
} from "@/lib/datetimeLocal";
import { EntryDeadlineCountdown } from "@/components/competitions/EntryDeadlineCountdown";
import CompetitionEntryForm from "@/components/CompetitionEntryForm";
import { hasOrgAdminAccess, isClubAdminRole } from "@/lib/roleScopes";
import { stripe } from "@/lib/stripe";
import { buildEntryCompletionReceipt } from "@/lib/entryCompletionReceipt";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { isEntryFeeSettled } from "@/lib/entryOrganizerPostPay";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  isTieredEntryFee,
  isTieredRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseAgeCategoryQualificationTiers,
  parseAgeFeeTiers,
  pickAgeCategoryIdForBirthDate,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
  resolveRequiredQualificationsForAgeCategory,
} from "@/lib/competitionEntryAgeTiered";
import { meetsCompetitionEventAgeEligibility } from "@/lib/competitionEventAgeEligibility";
import { getStripeProcessingFeeBpsFromEnv } from "@/lib/stripeProcessingFee";
import { reconcileTeamOnlyIntentZeroTotalFeeEntry } from "@/lib/teamOnlyIntentZeroFeeReconcile";
import {
  buildWithdrawableEventOptions,
  filterIndividualEventIdsFromEntry,
  hasSelectableWithdrawEvents,
} from "@/lib/entryWithdrawalRequest";

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
  return competitionMetadataTitle(id, "エントリー");
}

export default async function CompetitionEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string | string[]; mode?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawModeParam = sp.mode;
  const modeQuery =
    typeof rawModeParam === "string"
      ? rawModeParam
      : Array.isArray(rawModeParam)
        ? rawModeParam[0]
        : undefined;
  const requestedEntryMode =
    modeQuery === "individual" || modeQuery === "team-only" ? modeQuery : null;
  const rawSessionId = sp.session_id;
  const sessionIdFromUrl =
    typeof rawSessionId === "string"
      ? rawSessionId
      : Array.isArray(rawSessionId)
        ? rawSessionId[0]
        : undefined;
  const userId = await getRequiredAuthenticatedUserId();

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: userId },
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
        include: {
          ageCategory: {
            select: { id: true },
          },
        },
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
      userId: userId,
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
        where: { participantType: "INDIVIDUAL" },
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
            AGEカテゴリ別（生年月日の区分）
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

    const tiers = parseAgeFeeTiers(entryFee);
    if (tiers) {
      return (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">
            年齢帯別（移行待ち・開催日時点の満年齢）
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
      userId: userId,
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
  const hasTeamEntryAdminMembership = memberships.some((membership) =>
    isClubAdminRole(membership.role)
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: { select: { sex: true, dateOfBirth: true } },
      qualifications: {
        where: { status: "APPROVED" },
        select: { kind: true },
      },
    },
  });

  if (
    existingEntry?.status === "SUBMITTED" &&
    existingEntry.totalFee === 0 &&
    existingEntry.items.length === 0
  ) {
    const reconciled = await reconcileTeamOnlyIntentZeroTotalFeeEntry(existingEntry.id);
    if (reconciled) {
      const refreshed = await prisma.competitionEntry.findUnique({
        where: { id: existingEntry.id },
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
      if (refreshed) {
        existingEntry = refreshed;
      }
    }
  }

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

  const userDateOfBirth = user?.profile?.dateOfBirth ?? null;
  const userAge = userDateOfBirth
    ? getCompetitionEligibilityAgeYears(
        new Date(userDateOfBirth),
        new Date(competition.startDate)
      )
    : null;
  const userSex = user?.profile?.sex ?? "OTHER";
  const userQualifications = user?.qualifications?.map((q) => q.kind) ?? [];
  const userDob = userDateOfBirth ? new Date(userDateOfBirth) : null;

  // AGEカテゴリ別資格があるときは ageCategoryId 経由で、なければ年齢ベースで解決
  const hasAgeCategoryQual =
    parseAgeCategoryQualificationTiers(competition.requiredQualifications) !== null;
  const rq = hasAgeCategoryQual
    ? resolveRequiredQualificationsForAgeCategory(
        competition.requiredQualifications,
        userDob ? pickAgeCategoryIdForBirthDate(competition.ageCategories, userDob) : null
      )
    : resolveRequiredQualificationsForAge(competition.requiredQualifications, userAge);
  const meetsQualification =
    !rq.tierMissing &&
    (rq.list.length === 0
      ? true
      : rq.list.every((req) =>
          userQualifications.some((q) => matchesQualification(q, req))
        ));

  const feeResolution = resolveEntryFeeUnits(competition.entryFee, userAge, {
    userDateOfBirth: userDob,
    competitionAgeCategories: competition.ageCategories,
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

    const isMixedEvent = event.sex === "OTHER";
    if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
      return false;
    }

    if (
      !meetsCompetitionEventAgeEligibility({
        event,
        userDateOfBirth: userDateOfBirth ? new Date(userDateOfBirth) : null,
        seasonalAgeYears: userAge,
      })
    ) {
      return false;
    }

    if (event.type === "INDIVIDUAL") {
      return true;
    }
    if (event.type === "TEAM") {
      return requireClubMembership;
    }
    return false;
  });

  const missingQualificationLabels = rq.list.filter(
    (req) => !userQualifications.some((q) => matchesQualification(q, req))
  );

  const eligibilityMessages: string[] = [];
  if (!meetsQualification) {
    if (rq.tierMissing && isTieredRequiredQualifications(competition.requiredQualifications)) {
      eligibilityMessages.push(
        userAge === null
          ? hasAgeCategoryQual
            ? "この大会は AGEカテゴリごとの出場資格が設定されています。プロフィールに生年月日を登録してください。"
            : "この大会は年齢帯ごとの出場資格が設定されています。プロフィールに生年月日を登録してください。"
          : hasAgeCategoryQual
            ? "出場資格の AGEカテゴリに、あなたの生年月日が該当するものがありません。主催者へお問い合わせください。"
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
    const isCatFee = parseAgeCategoryFeeTiers(competition.entryFee) !== null;
    eligibilityMessages.push(
      userAge === null
        ? isCatFee
          ? "この大会は AGEカテゴリ別の参加費です。プロフィールに生年月日を登録してください。"
          : "この大会は年齢帯別（移行待ち）の参加費です。プロフィールの生年月日または年齢情報を確認してください。"
        : isCatFee
          ? "参加費の AGEカテゴリに、あなたの生年月日が該当するものがありません。主催者へお問い合わせください。"
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
          existingEntry.totalFee === 0 ||
          isEntryFeeSettled({
            status: existingEntry.status,
            totalFee: existingEntry.totalFee,
            clubIndividualFeePaidAt: existingEntry.clubIndividualFeePaidAt,
            organizerManualPaidAt: existingEntry.organizerManualPaidAt,
            checkoutSessions: existingEntry.checkoutSessions.map((s) => ({ status: s.status })),
          })
            ? ("PAID" as const)
            : ("UNPAID" as const),
      }
    : null;

  const clubIndividualBulkPaid = Boolean(existingEntry?.clubIndividualFeePaidAt);
  const entryFeeSettled = existingEntry
    ? isEntryFeeSettled({
        status: existingEntry.status,
        totalFee: existingEntry.totalFee,
        clubIndividualFeePaidAt: existingEntry.clubIndividualFeePaidAt,
        organizerManualPaidAt: existingEntry.organizerManualPaidAt,
        checkoutSessions: existingEntry.checkoutSessions.map((s) => ({ status: s.status })),
      })
    : false;
  const postPayApprovedPendingPayment = Boolean(
    existingEntry?.organizerPostPayApprovedAt && !entryFeeSettled
  );

  const deferredClubPaySlot =
    existingEntry?.clubId &&
    existingEntry.status === "SUBMITTED" &&
    existingEntry.totalFee > 0
      ? await prisma.clubCompetitionPrepaidIndividualSlot.findFirst({
          where: {
            competitionId: competition.id,
            clubId: existingEntry.clubId,
            coveredUserId: userId,
            status: "DEFERRED_POST_CLOSE",
          },
          select: { id: true },
        })
      : null;
  const clubBulkSettlementPending = Boolean(
    deferredClubPaySlot && !clubIndividualBulkPaid && !entryFeeSettled
  );
  const awaitingDbPaymentConfirmation = Boolean(
    existingEntry &&
      existingEntry.status === "SUBMITTED" &&
      existingEntry.totalFee > 0 &&
      !entryFeeSettled &&
      !postPayApprovedPendingPayment &&
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
    !entryFeeSettled &&
    !clubIndividualBulkPaid &&
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
  if (clubBulkSettlementPending) {
    entryPaymentPhase = null;
  }

  const entryCancelled = existingEntry?.status === "CANCELLED";

  const competitionEventTypeById = new Map(
    competition.events.map((e) => [e.id, e.type])
  );

  const itemTypesPersisted =
    initialEntry?.items
      ?.map((item) => competitionEventTypeById.get(item.eventId))
      .filter((t): t is "INDIVIDUAL" | "TEAM" => t === "INDIVIDUAL" || t === "TEAM") ??
    [];

  const persistedEntryTypeSet = new Set(itemTypesPersisted);

  let legacyMixedPersisted = false;
  let inferredPersistedMode: "individual" | "team-only" | null = null;
  if (persistedEntryTypeSet.size > 1) {
    legacyMixedPersisted = true;
  } else if (persistedEntryTypeSet.size === 1) {
    inferredPersistedMode = persistedEntryTypeSet.has("TEAM") ? "team-only" : "individual";
  }

  /** 種別変更不可（決済状態・単一 XOR）のとき確定済み種別がある */
  const lockEntryModeFromRecord =
    Boolean(existingEntry?.status === "SUBMITTED") &&
    !entryCancelled &&
    (persistedEntryTypeSet.size > 0 || legacyMixedPersisted);

  if (
    lockEntryModeFromRecord &&
    inferredPersistedMode &&
    requestedEntryMode &&
    requestedEntryMode !== inferredPersistedMode
  ) {
    const qs = new URLSearchParams();
    if (sessionIdFromUrl) qs.set("session_id", sessionIdFromUrl);
    qs.set("mode", inferredPersistedMode);
    redirect(`/competitions/${id}/entry?${qs.toString()}`);
  }

  const hasEligibleIndividualForPicker = eligibleEvents.some((e) => e.type === "INDIVIDUAL");
  const hasEligibleTeamForPicker = eligibleEvents.some((e) => e.type === "TEAM");

  const pickingPersonalEntryMode =
    !lockEntryModeFromRecord &&
    !legacyMixedPersisted &&
    isCompetitionEligible &&
    isEntryWindowOpen &&
    !entryCancelled &&
    requestedEntryMode === null;

  const personalEntryMode: "individual" | "team-only" | "legacy-mixed" =
    legacyMixedPersisted ? "legacy-mixed" : (inferredPersistedMode ?? requestedEntryMode ?? "individual");

  const eventsForPersonalEntryForm =
    legacyMixedPersisted || personalEntryMode === "legacy-mixed"
      ? eligibleEvents
      : personalEntryMode === "individual"
        ? eligibleEvents.filter((e) => e.type === "INDIVIDUAL")
        : [];

  const entryQuerySuffix = sessionIdFromUrl
    ? `session_id=${encodeURIComponent(sessionIdFromUrl)}`
    : "";

  const entryUserFacing = existingEntry
    ? getEntryUserFacingStatus({
        status: existingEntry.status,
        totalFee: existingEntry.totalFee,
        checkoutSessions: existingEntry.checkoutSessions.map((s) => ({ status: s.status })),
        clubIndividualFeePaidAt: existingEntry.clubIndividualFeePaidAt,
        organizerPostPayApprovedAt: existingEntry.organizerPostPayApprovedAt,
        organizerManualPaidAt: existingEntry.organizerManualPaidAt,
      })
    : null;

  const entryEstablished = Boolean(
    existingEntry && entryUserFacing?.businessEstablished && !entryCancelled
  );

  const eventLabelById = new Map(competition.events.map((event) => [event.id, event.name]));
  const individualEventIdsForWithdraw = existingEntry
    ? filterIndividualEventIdsFromEntry(existingEntry.items, competitionEventTypeById)
    : [];
  const withdrawableEvents = existingEntry
    ? buildWithdrawableEventOptions({
        individualEventIds: individualEventIdsForWithdraw,
        eventLabelById,
        participantStatuses: existingEntry.participantStatuses,
        startListSettings: competition.startListSettings,
      })
    : [];
  const canRequestWithdraw = Boolean(
    existingEntry &&
      !entryCancelled &&
      hasSelectableWithdrawEvents(withdrawableEvents) &&
      (competition.status === "PUBLISHED" || competition.status === "ONGOING")
  );
  const entryWithdrawAppliedCount = withdrawableEvents.filter((event) => event.alreadyWithdrawn)
    .length;

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
          type: e.type,
        })),
        entry: {
          id: existingEntry.id,
          status: existingEntry.status,
          totalFee: existingEntry.totalFee,
          clubIndividualFeePaidAt: existingEntry.clubIndividualFeePaidAt,
          organizerPostPayApprovedAt: existingEntry.organizerPostPayApprovedAt,
          organizerManualPaidAt: existingEntry.organizerManualPaidAt,
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
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-sm sm:self-start sm:text-xs"
              asChild
            >
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
                <p className="leading-snug text-foreground">
                  資格要件を満たしています。下の画面の案内に従って手続きを進められます。
                </p>
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
                    申請資格:{" "}
                    {userQualifications.length > 0 ? userQualifications.join("、") : "なし"}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {clubBulkSettlementPending ? (
        <Card className="border-sky-200/80 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/25">
          <CardContent className="px-4 py-3 text-sm leading-relaxed text-sky-950 dark:text-sky-100">
            <p className="font-medium text-foreground">個人参加費はクラブ一括請求（締切後）の対象です</p>
            <p className="mt-1.5 text-muted-foreground">
              カード決済は不要です。エントリー締切後に主催者が請求を確定し、クラブがチーム参加費とあわせて支払うとエントリーが成立します。それまでは内容の変更はできません。
            </p>
          </CardContent>
        </Card>
      ) : null}

      {postPayApprovedPendingPayment ? (
        <Card className="border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/25">
          <CardContent className="px-4 py-3 text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">
            <p className="font-medium text-foreground">エントリーは成立しています（参加費は後払い）</p>
            <p className="mt-1.5 text-muted-foreground">
              主催者により後払いが承認されました。受付内容の確認・変更申請は可能です。カード決済は受付票の「決済へ進む」からお支払いいただけます。
            </p>
          </CardContent>
        </Card>
      ) : null}

      {pickingPersonalEntryMode ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold">エントリーする内容を選んでください</CardTitle>
            <CardDescription className="text-xs leading-relaxed sm:text-sm">
              個人種目に出る場合と、チーム種目にのみ出場する場合では手続きが分かれます。
              チーム枠の登録やチーム名は、クラブ権限者が「チームエントリー」で行います。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
              <p className="text-xs text-muted-foreground">
                クラブのチーム枠・チーム名は代表者が登録します。
              </p>
              {hasTeamEntryAdminMembership ? (
                <Button variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" asChild>
                  <Link href={appRoutes.competitions.teamEntry(competition.id)}>
                    クラブのチームエントリーへ
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {hasEligibleIndividualForPicker ? (
                <Button
                  variant="outline"
                  className="h-auto min-h-[5.5rem] flex-col gap-2 whitespace-normal px-4 py-4 text-center"
                  asChild
                >
                  <Link
                    href={`/competitions/${competition.id}/entry?mode=individual${
                      entryQuerySuffix ? `&${entryQuerySuffix}` : ""
                    }`}
                  >
                    <User className="h-6 w-6 text-primary" aria-hidden />
                    <span className="text-sm font-semibold leading-snug">個人種目にエントリー</span>
                    <span className="text-center text-xs font-normal leading-snug text-muted-foreground">
                      プール／オーシャン等の個人種目のみ
                    </span>
                  </Link>
                </Button>
              ) : null}
              {hasEligibleTeamForPicker && requireClubMembership ? (
                <Button
                  variant="outline"
                  className="h-auto min-h-[5.5rem] flex-col gap-2 whitespace-normal px-4 py-4 text-center"
                  asChild
                >
                  <Link
                    href={`/competitions/${competition.id}/entry?mode=team-only${
                      entryQuerySuffix ? `&${entryQuerySuffix}` : ""
                    }`}
                  >
                    <UsersRound className="h-6 w-6 text-primary" aria-hidden />
                    <span className="text-sm font-semibold leading-snug">チーム種目のみ</span>
                    <span className="text-center text-xs font-normal leading-snug text-muted-foreground">
                      個人種目には出ません。ここでは種目を選択せず、配属候補として登録します。
                    </span>
                  </Link>
                </Button>
              ) : hasEligibleTeamForPicker && !requireClubMembership ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  チーム種目はこの大会では所属クラブ必須です。承認済みのクラブがある場合に選べます。
                </div>
              ) : null}
            </div>
            {!hasEligibleIndividualForPicker && !hasEligibleTeamForPicker ? (
              <p className="text-xs text-muted-foreground">この条件ではエントリーできる種目がありません。</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!pickingPersonalEntryMode &&
      eventsForPersonalEntryForm.length === 0 &&
      personalEntryMode !== "team-only" &&
      isCompetitionEligible &&
      isEntryWindowOpen &&
      !entryCancelled ? (
        <Card className="border-border/80">
          <CardContent className="px-4 py-4 text-sm text-muted-foreground">
            {legacyMixedPersisted || personalEntryMode === "legacy-mixed"
              ? "表示できる種目がありません。ページを更新しても改善しない場合は主催者へお問い合わせください。"
              : "この条件では個人種目がありません。"}
          </CardContent>
        </Card>
      ) : null}

      {!pickingPersonalEntryMode &&
      (eventsForPersonalEntryForm.length > 0 || personalEntryMode === "team-only") ? (
      <CompetitionEntryForm
        competitionId={competition.id}
        events={eventsForPersonalEntryForm}
        personalEntryMode={personalEntryMode}
        memberships={memberships}
        entryWindowOpen={isEntryWindowOpen}
        entryFee={competition.entryFee as unknown as CompetitionEntryFormProps["entryFee"]}
        userAgeYearsAtCompetitionStart={userAge}
        userDateOfBirthISO={userDateOfBirth ? new Date(userDateOfBirth).toISOString() : null}
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
        withdrawableEvents={withdrawableEvents}
        entryWithdrawAppliedCount={entryWithdrawAppliedCount}
        entryPledge={
          entryPledgeActive
            ? { markdown: pledgeMarkdown, initialAccepted: initialPledgeAccepted }
            : null
        }
        cardProcessingFeeBps={getStripeProcessingFeeBpsFromEnv()}
      />
      ) : null}
    </div>
  );
}
