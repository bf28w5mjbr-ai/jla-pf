import { jsonInternalError500 } from "@/lib/apiInternalError";
import { stripeRedirectOrigin } from "@/lib/appBaseUrl";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { createPaymentCheckout, stripe } from "@/lib/stripe";
import {
  assertEntryStripeCheckoutRateLimit,
  getClientIpFromRequest,
  isStripeCheckoutClientIpBlocked,
  STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE,
} from "@/lib/stripeCheckoutGuards";
import { applicationFeeAmountYen } from "@/lib/platformFee";
import {
  getStripeProcessingFeeBpsFromEnv,
  stripeProcessingFeeSurchargeYenFromBps,
} from "@/lib/stripeProcessingFee";
import {
  connectRequirementSkipped,
  paidEntryCheckoutBlockReason,
  resolveEntryCheckoutStripeConnectParams,
} from "@/lib/organizerBilling";
import { refreshOrganizationStripeConnectFlags } from "@/lib/organizerStripeConnect";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { entryRequiresClubSelection } from "@/lib/entryClubPaymentRules";
import { clearIndividualWithdrawalParticipantStatusesForEvents } from "@/lib/entryWithdrawalReinstatement";
import {
  collectEventIdsFromEntrySavePayload,
  syncStartListSnapshotBeforeMarshal,
} from "@/lib/startListSnapshotOnEntryIncrease";
import { hostOrgAdminCanManageCompetition, isClubAdminRole } from "@/lib/roleScopes";
import {
  billingCountsForPersonalEntryPost,
  calculateCompetitionEntryFee,
  type CompetitionEntryFeeConfig,
} from "@/lib/entryFee";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import { meetsCompetitionEventAgeEligibility } from "@/lib/competitionEventAgeEligibility";
import {
  isTieredEntryFee,
  isTieredRequiredQualifications,
  maxIndividualEntryFeeUnitAcrossTiers,
  parseAgeCategoryFeeTiers,
  parseAgeCategoryQualificationTiers,
  pickAgeCategoryIdForBirthDate,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
  resolveRequiredQualificationsForAgeCategory,
} from "@/lib/competitionEntryAgeTiered";
import { resolveClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import {
  personalEntryItemsHasMixedEventTypes,
  shouldBlockPersonalEntryItemsXorForGeneralUser,
} from "@/lib/personalEntryItemsXor";
import {
  COMPETITION_ENTRY_SAVE_TRANSACTION,
  isPrismaPoolRetryable,
  prismaPoolBusyUserMessage,
  withPrismaPoolRetryOnce,
} from "@/lib/prismaPool";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** 未決済ロック時にスナップショット一致判定するための正規化 */
function serializeEntrySnapshotPayload(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return JSON.stringify({
      items: [] as { eventId: string; entryTime: string | null }[],
      teamEntries: [] as { eventId: string; teamName: string }[],
      notes: null as string | null,
      clubId: null as string | null,
    });
  }
  const o = data as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const teamRaw = Array.isArray(o.teamEntries) ? o.teamEntries : [];
  const items = itemsRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const eventId = typeof r.eventId === "string" ? r.eventId : "";
      const entryTime = r.entryTime == null ? null : String(r.entryTime).trim() || null;
      return { eventId, entryTime };
    })
    .filter((x): x is { eventId: string; entryTime: string | null } => Boolean(x?.eventId))
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
  const teamEntries = teamRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const eventId = typeof r.eventId === "string" ? r.eventId : "";
      const teamName = typeof r.teamName === "string" ? r.teamName.trim() : "";
      return { eventId, teamName };
    })
    .filter((x): x is { eventId: string; teamName: string } => Boolean(x?.eventId))
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
  const notes = o.notes == null ? null : String(o.notes).trim() || null;
  const clubId = o.clubId == null || o.clubId === "" ? null : String(o.clubId);
  return JSON.stringify({ items, teamEntries, notes, clubId });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { clubId, notes, items, teamEntries, confirmed, pledgeAccepted } = body ?? {};

    if (!confirmed) {
      return NextResponse.json(
        { message: "参加者確認に同意してください" },
        { status: 400 }
      );
    }

    const itemsArray = Array.isArray(items) ? items : [];
    const hasTeamEntriesField = "teamEntries" in (body ?? {});
    const teamEntriesArray =
      hasTeamEntriesField && Array.isArray(teamEntries) ? teamEntries : [];
    const teamOnlyIntentWithoutItemSelection =
      !hasTeamEntriesField &&
      itemsArray.length === 0 &&
      typeof clubId === "string" &&
      clubId.trim().length > 0;

    const preservedTeamEntriesFromSnapshot: { eventId: string; teamName: string }[] = [];
    let snapshotClubIdForPreservedTeams: string | null = null;
    if (!hasTeamEntriesField) {
      const prevForTeam = await prisma.competitionEntry.findFirst({
        where: {
          competitionId,
          userId: session.userId,
          status: "SUBMITTED",
        },
        select: {
          clubId: true,
          snapshot: { select: { data: true } },
        },
      });
      if (
        prevForTeam?.snapshot?.data &&
        typeof prevForTeam.snapshot.data === "object" &&
        !Array.isArray(prevForTeam.snapshot.data)
      ) {
        const sd = prevForTeam.snapshot.data as Record<string, unknown>;
        const rawTeams = sd.teamEntries;
        snapshotClubIdForPreservedTeams =
          typeof sd.clubId === "string" && sd.clubId.trim()
            ? sd.clubId
            : (prevForTeam.clubId ?? null);
        if (Array.isArray(rawTeams)) {
          for (const row of rawTeams) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            const eventId = typeof r.eventId === "string" ? r.eventId : "";
            const teamName = typeof r.teamName === "string" ? r.teamName.trim() : "";
            if (eventId && teamName) {
              preservedTeamEntriesFromSnapshot.push({ eventId, teamName });
            }
          }
        }
      }
    }

    const selectedCount =
      itemsArray.length +
      (hasTeamEntriesField ? teamEntriesArray.length : preservedTeamEntriesFromSnapshot.length);

    if (selectedCount === 0 && !teamOnlyIntentWithoutItemSelection) {
      return NextResponse.json(
        { message: "種目を1つ以上選択してください" },
        { status: 400 }
      );
    }

    if (teamEntriesArray.length > 0 && (!clubId || typeof clubId !== "string")) {
      return NextResponse.json(
        { message: "チーム種目を選択する場合は所属クラブが必要です" },
        { status: 400 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        events: {
          orderBy: { displayOrder: "asc" },
          include: {
            ageCategory: {
              select: { id: true },
            },
          },
        },
        ageCategories: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            displayOrder: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
          },
        },
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    const entryPledgeEnabled = competition.entryPledgeEnabled ?? false;
    const pledgeTextLive = (competition.entryPledgeText ?? "").trim();
    if (entryPledgeEnabled) {
      if (!pledgeTextLive) {
        return NextResponse.json(
          { message: "この大会の誓約設定が不正です。主催者へお問い合わせください" },
          { status: 400 }
        );
      }
      if (pledgeAccepted !== true) {
        return NextResponse.json(
          { message: "誓約に同意してください" },
          { status: 400 }
        );
      }
    }

    const allowMultipleEventEntries = competition.allowMultipleEventEntries ?? true;
    const maxEventEntriesPerPerson =
      typeof competition.maxEventEntriesPerPerson === "number" &&
      competition.maxEventEntriesPerPerson > 0
        ? competition.maxEventEntriesPerPerson
        : null;
    const requireClubMembership = competition.requireClubMembership ?? false;

    if (entryRequiresClubSelection({ requireClubMembership, clubId })) {
      return NextResponse.json(
        { message: "所属クラブを選択してください" },
        { status: 400 }
      );
    }

    if (!requireClubMembership && teamEntriesArray.length > 0) {
      return NextResponse.json(
        { message: "チーム種目は所属クラブ必須のため選択できません" },
        { status: 400 }
      );
    }

    if (!allowMultipleEventEntries && selectedCount > 1) {
      return NextResponse.json(
        { message: "この大会は1種目のみ選択可能です" },
        { status: 400 }
      );
    }

    if (allowMultipleEventEntries && maxEventEntriesPerPerson !== null && selectedCount > maxEventEntriesPerPerson) {
      return NextResponse.json(
        { message: `この大会は${maxEventEntriesPerPerson}種目まで選択可能です` },
        { status: 400 }
      );
    }

    const isAdmin = hostOrgAdminCanManageCompetition(competition.organization.admins, competition.organization.status);

    const now = new Date();
    const pledgeAcceptedAt = entryPledgeEnabled ? now : null;
    const pledgeTextSnapshot = entryPledgeEnabled ? pledgeTextLive : null;
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;

    if (!entryWindowOpen && !isAdmin) {
      return NextResponse.json(
        { message: "エントリー受付期間外のため送信できません" },
        { status: 403 }
      );
    }

    const eventMap = new Map(competition.events.map((event) => [event.id, event]));

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        profile: { select: { sex: true, dateOfBirth: true } },
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

    const userDateOfBirth = user?.profile?.dateOfBirth ?? null;
    const userAge = userDateOfBirth
      ? getCompetitionEligibilityAgeYears(
          new Date(userDateOfBirth),
          new Date(competition.startDate)
        )
      : null;
    const userSex = user?.profile?.sex ?? "OTHER";
    const userQualifications = user?.qualifications?.map((q) => q.kind) ?? [];
    const userDobForCat = userDateOfBirth ? new Date(userDateOfBirth) : null;

    const hasAgeCategoryQual =
      parseAgeCategoryQualificationTiers(competition.requiredQualifications) !== null;
    const userAgeCategoryId = userDobForCat
      ? pickAgeCategoryIdForBirthDate(competition.ageCategories, userDobForCat)
      : null;
    const rq = hasAgeCategoryQual
      ? resolveRequiredQualificationsForAgeCategory(
          competition.requiredQualifications,
          userAgeCategoryId
        )
      : resolveRequiredQualificationsForAge(competition.requiredQualifications, userAge);
    if (rq.tierMissing && isTieredRequiredQualifications(competition.requiredQualifications)) {
      return NextResponse.json(
        {
          message: userDateOfBirth
            ? hasAgeCategoryQual
              ? "出場資格の AGEカテゴリに、あなたの生年月日が該当するものがありません。主催者へお問い合わせください。"
              : "出場資格の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
            : hasAgeCategoryQual
              ? "この大会は AGEカテゴリごとの出場資格が設定されています。プロフィールに生年月日を登録してください。"
              : "この大会は年齢帯ごとの出場資格が設定されています。プロフィールに生年月日を登録してください。",
        },
        { status: 400 }
      );
    }

    const meetsQualification =
      rq.list.length === 0
        ? true
        : rq.list.every((req) =>
            userQualifications.some((q) => matchesQualification(q, req))
          );

    if (!meetsQualification) {
      return NextResponse.json(
        { message: "参加資格を満たしていません" },
        { status: 400 }
      );
    }

    if (userAge !== null) {
      if (typeof competition.minAge === "number" && userAge < competition.minAge) {
        return NextResponse.json(
          { message: "年齢条件を満たしていません" },
          { status: 400 }
        );
      }
      if (typeof competition.maxAge === "number" && userAge > competition.maxAge) {
        return NextResponse.json(
          { message: "年齢条件を満たしていません" },
          { status: 400 }
        );
      }
    }

    const invalidEvent = itemsArray.find((item: { eventId?: string }) => {
      const id = item.eventId;
      if (typeof id !== "string") return true;
      return !eventMap.has(id);
    });
    if (invalidEvent) {
      return NextResponse.json({ message: "種目が不正です" }, { status: 400 });
    }

    if (hasTeamEntriesField) {
      const invalidTeamEvent = teamEntriesArray.find((item: { eventId?: string }) => {
        const id = item.eventId;
        if (typeof id !== "string") return true;
        return !eventMap.has(id);
      });
      if (invalidTeamEvent) {
        return NextResponse.json({ message: "種目が不正です" }, { status: 400 });
      }
    }

    const approvedMembership = clubId
      ? await prisma.membership.findFirst({
          where: {
            userId: session.userId,
            clubId,
            status: "APPROVED",
          },
        })
      : null;

    if (clubId && !approvedMembership) {
      return NextResponse.json(
        { message: "所属クラブが確認できません" },
        { status: 400 }
      );
    }

    if (requireClubMembership && !approvedMembership) {
      return NextResponse.json(
        { message: "所属クラブが必要です" },
        { status: 400 }
      );
    }

    if (hasTeamEntriesField) {
      if (!clubId || typeof clubId !== "string") {
        return NextResponse.json(
          { message: "チーム種目の更新には所属クラブの指定が必要です" },
          { status: 400 }
        );
      }
      if (!approvedMembership || !isClubAdminRole(approvedMembership.role)) {
        return NextResponse.json(
          {
            message:
              "チーム種目の登録・変更はクラブ管理者のみが行えます。クラブのチーム管理から操作してください。",
          },
          { status: 403 }
        );
      }
    }

    if (!hasTeamEntriesField && preservedTeamEntriesFromSnapshot.length > 0) {
      const lockedClubId = snapshotClubIdForPreservedTeams;
      if (typeof clubId !== "string" || !lockedClubId || clubId !== lockedClubId) {
        return NextResponse.json(
          {
            message:
              "チーム種目が登録済みのため、所属クラブは変更できません。クラブのチーム管理でチームを編集できます。",
          },
          { status: 400 }
        );
      }
    }

    const validateEntrantSexAndAgeForEvent = (event: NonNullable<ReturnType<typeof eventMap.get>>) => {
      const isMixedEvent = event.sex === "OTHER";
      if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
        throw new Error("性別条件を満たしていません");
      }
      if (
        !meetsCompetitionEventAgeEligibility({
          event,
          userDateOfBirth: userDateOfBirth ? new Date(userDateOfBirth) : null,
          seasonalAgeYears: userAge,
        })
      ) {
        throw new Error("年齢条件を満たしていません");
      }
    };

    const entryItemsData = itemsArray.map((item: { eventId: string; entryTime?: string | null }) => {
      const event = eventMap.get(item.eventId);
      if (!event) {
        throw new Error("種目が不正です");
      }
      if (event.type === "INDIVIDUAL") {
        validateEntrantSexAndAgeForEvent(event);
        if (event.requiresEntryTime && (!item.entryTime || !item.entryTime.trim())) {
          throw new Error("エントリータイムが必要です");
        }
        return {
          eventId: event.id,
          entryTime: item.entryTime?.trim() || null,
        };
      }
      if (event.type === "TEAM") {
        if (!requireClubMembership) {
          throw new Error("チーム種目は所属クラブ必須のため選択できません");
        }
        validateEntrantSexAndAgeForEvent(event);
        return {
          eventId: event.id,
          entryTime: item.entryTime?.trim() || null,
        };
      }
      throw new Error("種目タイプが不正です");
    });

    /** 個人種目とチーム種目の同日エントリー（items 単位）を禁止（移行前の混在データは更新のみ例外）。 */
    const nextItemTypes = entryItemsData
      .map((row) => eventMap.get(row.eventId)?.type)
      .filter((t): t is "INDIVIDUAL" | "TEAM" => t === "INDIVIDUAL" || t === "TEAM");
    let persistedSubmittedItemTypesForXor: ("INDIVIDUAL" | "TEAM")[] = [];
    if (!isAdmin && personalEntryItemsHasMixedEventTypes(nextItemTypes)) {
      const prevForXorTypes = await prisma.competitionEntry.findFirst({
        where: {
          competitionId,
          userId: session.userId,
          status: "SUBMITTED",
        },
        select: {
          items: { select: { eventId: true } },
        },
      });
      persistedSubmittedItemTypesForXor =
        prevForXorTypes?.items
          .map((row) => eventMap.get(row.eventId)?.type)
          .filter((t): t is "INDIVIDUAL" | "TEAM" => t === "INDIVIDUAL" || t === "TEAM") ?? [];
    }
    if (
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin,
        incomingItemTypes: nextItemTypes,
        persistedSubmittedItemTypes: persistedSubmittedItemTypesForXor,
      })
    ) {
      return NextResponse.json(
        {
          message:
            "個人種目とチーム種目を同一エントリーでは同時に選べません。「個人種目」または「チーム種目のみ」を選び直してください。",
        },
        { status: 400 }
      );
    }

    const teamEntriesData = hasTeamEntriesField
      ? teamEntriesArray.map((item: { eventId: string; teamName?: string }) => {
          const event = eventMap.get(item.eventId);
          if (!event) {
            throw new Error("種目が不正です");
          }
          if (event.type !== "TEAM") {
            throw new Error("チーム種目のみ選択できます");
          }
          // チーム枠はクラブ管理者が登録するのみ。出場者の性別・年齢はメンバー割当で検証する。
          if (!item.teamName || typeof item.teamName !== "string" || !item.teamName.trim()) {
            throw new Error("チーム名を入力してください");
          }

          return {
            eventId: event.id,
            teamName: item.teamName.trim(),
          };
        })
      : preservedTeamEntriesFromSnapshot;

    const { individualCount: feeIndividualCount, teamCount: feeTeamCount } =
      billingCountsForPersonalEntryPost({
        teamOnlyIntentWithoutItemSelection,
        entryItemsCount: entryItemsData.length,
        teamEntriesCount: teamEntriesData.length,
      });

    const userDob = userDateOfBirth ? new Date(userDateOfBirth) : null;
    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
    });
    const clubAdminTeamOnlyFeeBypass =
      hasTeamEntriesField &&
      approvedMembership &&
      isClubAdminRole(approvedMembership.role) &&
      entryItemsData.length === 0 &&
      teamEntriesData.length > 0;

    if (
      feeUnits.ageTierMissing &&
      isTieredEntryFee(competition.entryFee) &&
      feeIndividualCount + feeTeamCount > 0 &&
      !clubAdminTeamOnlyFeeBypass
    ) {
      const isCat = parseAgeCategoryFeeTiers(competition.entryFee) !== null;
      return NextResponse.json(
        {
          message: isCat
            ? userDateOfBirth
              ? "参加費の年齢カテゴリに、あなたの生年月日が該当する区分がありません。主催者へお問い合わせください。"
              : "この大会は年齢カテゴリ別の参加費です。プロフィールに生年月日を登録してください。"
            : userDateOfBirth
              ? "参加費の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
              : "この大会は年齢帯別（移行待ち）の参加費です。プロフィールの生年月日または年齢情報を確認してください。",
        },
        { status: 400 }
      );
    }

    let baseEntryFee: number;
    if (clubAdminTeamOnlyFeeBypass && feeUnits.ageTierMissing && isTieredEntryFee(competition.entryFee)) {
      const fallbackIndividualUnit = maxIndividualEntryFeeUnitAcrossTiers(competition.entryFee);
      if (fallbackIndividualUnit == null) {
        return NextResponse.json(
          { message: "参加費の個人単価を解決できません。主催者へお問い合わせください。" },
          { status: 400 }
        );
      }
      baseEntryFee = fallbackIndividualUnit;
    } else {
      baseEntryFee = calculateCompetitionEntryFee(
        competition.entryFee as CompetitionEntryFeeConfig | number | null,
        {
          individualCount: feeIndividualCount,
          teamCount: feeTeamCount,
        },
        {
          userAgeYearsAtCompetitionStart: userAge,
          userDateOfBirth: userDob,
          competitionAgeCategories: competition.ageCategories,
        }
      );
    }

    const clubIndividualBillingTiming = resolveClubIndividualEntryBillingTiming(
      competition.entryFee
    );
    let totalFee = baseEntryFee;
    let skipIndividualCheckoutForDeferred = false;
    let waiverSlotIdToConsume: string | null = null;

    if (totalFee > 0 && typeof clubId === "string") {
      const deferredSlot = await prisma.clubCompetitionPrepaidIndividualSlot.findFirst({
        where: {
          competitionId,
          clubId,
          coveredUserId: session.userId,
          status: "DEFERRED_POST_CLOSE",
        },
        select: { id: true },
      });
      if (
        deferredSlot &&
        clubIndividualBillingTiming === "POST_CLOSE_INVOICE" &&
        entryItemsData.length > 0
      ) {
        skipIndividualCheckoutForDeferred = true;
      }

      const instantWaiverSlot = await prisma.clubCompetitionPrepaidIndividualSlot.findFirst({
        where: {
          competitionId,
          clubId,
          coveredUserId: session.userId,
          status: "ACTIVE_WAIVER",
          consumedByEntryId: null,
        },
        select: { id: true },
      });
      if (
        instantWaiverSlot &&
        clubIndividualBillingTiming === "INSTANT_PREPAID" &&
        entryItemsData.length > 0 &&
        teamEntriesData.length === 0 &&
        !feeUnits.ageTierMissing
      ) {
        const individualPortion = entryItemsData.length > 0 ? feeUnits.individualUnit : 0;
        const nextFee = Math.max(0, baseEntryFee - individualPortion);
        if (nextFee < baseEntryFee) {
          totalFee = nextFee;
          if (totalFee === 0) {
            waiverSlotIdToConsume = instantWaiverSlot.id;
          }
        }
      }
    }

    const entrySnapshot = {
      notes: typeof notes === "string" ? notes.trim() : null,
      items: entryItemsData,
      teamEntries: teamEntriesData,
      clubId: clubId ?? null,
    };

    const previousSubmittedEntry = await prisma.competitionEntry.findFirst({
      where: {
        competitionId,
        userId: session.userId,
        status: "SUBMITTED",
      },
      select: { items: { select: { eventId: true } } },
    });
    const previousEntryEventIds =
      previousSubmittedEntry?.items.map((item) => item.eventId) ?? [];

    const result = await withPrismaPoolRetryOnce(() =>
      prisma.$transaction(async (tx) => {
      const lockKey = `competition-entry:${competitionId}:${session.userId}`;
      // 同一大会・同一ユーザーの同時POSTで重複エントリーが作られるのを防ぐ。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existingEntry = await tx.competitionEntry.findFirst({
        where: {
          competitionId,
          userId: session.userId,
          status: "SUBMITTED",
        },
        select: { id: true, totalFee: true },
      });

      if (existingEntry && !isAdmin && existingEntry.totalFee > 0) {
        const hasCompletedCheckout = await tx.entryCheckoutSession.findFirst({
          where: { entryId: existingEntry.id, status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] } },
          select: { id: true },
        });
        if (!hasCompletedCheckout) {
          const prevSnapRow = await tx.entrySnapshot.findUnique({
            where: { entryId: existingEntry.id },
            select: { data: true },
          });
          if (prevSnapRow?.data != null) {
            const prevSerialized = serializeEntrySnapshotPayload(prevSnapRow.data);
            const nextSerialized = serializeEntrySnapshotPayload(entrySnapshot);
            if (prevSerialized !== nextSerialized) {
              throw new Error(
                "未決済のためエントリー内容は変更できません。先に決済を完了してください。"
              );
            }
          }
        }
      }

      const entry = existingEntry
        ? await tx.competitionEntry.update({
            where: { id: existingEntry.id },
            data: {
              clubId: clubId ?? null,
              totalFee,
              status: "SUBMITTED",
              pledgeAcceptedAt,
              pledgeTextSnapshot,
              items: {
                deleteMany: {},
                create: entryItemsData,
              },
            },
          })
        : await tx.competitionEntry.create({
            data: {
              competitionId,
              userId: session.userId,
              clubId: clubId ?? null,
              totalFee,
              pledgeAcceptedAt,
              pledgeTextSnapshot,
              items: {
                create: entryItemsData,
              },
            },
          });

      await tx.entrySnapshot.upsert({
        where: { entryId: entry.id },
        update: { data: entrySnapshot },
        create: {
          entryId: entry.id,
          data: entrySnapshot,
        },
      });

      await clearIndividualWithdrawalParticipantStatusesForEvents(tx, {
        competitionId,
        competitionEntryId: entry.id,
        individualEventIds: entryItemsData
          .map((row) => row.eventId)
          .filter((id) => eventMap.get(id)?.type === "INDIVIDUAL"),
        updatedByUserId: session.userId,
      });

      if (hasTeamEntriesField) {
        const existingTeamEntries = await tx.teamEntry.findMany({
          where: {
            competitionId,
            members: {
              some: {
                userId: session.userId,
                role: "申請者",
              },
            },
          },
          select: { id: true },
        });

        if (existingTeamEntries.length > 0) {
          await tx.teamEntry.deleteMany({
            where: {
              id: {
                in: existingTeamEntries.map((item) => item.id),
              },
            },
          });
        }

        if (teamEntriesData.length > 0 && clubId) {
          const incomingByEvent = new Map<string, number>();
          for (const t of teamEntriesData) {
            incomingByEvent.set(t.eventId, (incomingByEvent.get(t.eventId) ?? 0) + 1);
          }
          for (const [eventId, incoming] of incomingByEvent) {
            const ev = eventMap.get(eventId);
            const cap = ev?.maxTeamEntriesPerClub ?? null;
            if (cap == null) continue;
            const remaining = await tx.teamEntry.count({
              where: { competitionId, clubId, eventId },
            });
            if (remaining + incoming > cap) {
              throw new Error(
                `「${ev?.name ?? "チーム種目"}」では同一クラブあたり最大${cap}組までです。既存のチームエントリーと合わせて上限を超えます。`
              );
            }
          }
        }

        if (teamEntriesData.length > 0) {
          for (const teamEntry of teamEntriesData) {
            const created = await tx.teamEntry.create({
              data: {
                competitionId,
                eventId: teamEntry.eventId,
                clubId: clubId as string,
                teamName: teamEntry.teamName,
              },
            });

            await tx.teamEntryMember.create({
              data: {
                teamEntryId: created.id,
                userId: session.userId,
                role: "申請者",
                order: 1,
              },
            });
          }
        }
      }

      if (waiverSlotIdToConsume) {
        const consumed = await tx.clubCompetitionPrepaidIndividualSlot.updateMany({
          where: {
            id: waiverSlotIdToConsume,
            status: "ACTIVE_WAIVER",
            consumedByEntryId: null,
          },
          data: {
            status: "CONSUMED",
            consumedAt: new Date(),
            consumedByEntryId: entry.id,
          },
        });
        if (consumed.count === 0) {
          throw new Error(
            "クラブ先払い枠の利用に失敗しました。ページを更新してから再度お試しください。"
          );
        }
      }

      return {
        entry,
        wasUpdate: Boolean(existingEntry),
      };
    }, COMPETITION_ENTRY_SAVE_TRANSACTION)
    );

    const latestCompletedCheckout = await prisma.entryCheckoutSession.findFirst({
      where: {
        entryId: result.entry.id,
        status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });

    if (totalFee > 0 && !latestCompletedCheckout && !skipIndividualCheckoutForDeferred) {
      await refreshOrganizationStripeConnectFlags(competition.organizationId);
      const orgBilling = await prisma.organization.findUnique({
        where: { id: competition.organizationId },
        select: {
          onboardingFeeStatus: true,
          organizerSubscriptionStatus: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
        },
      });
      const paidBlock = orgBilling
        ? paidEntryCheckoutBlockReason(orgBilling, {
            stripeSettlementAccountType: competition.stripeSettlementAccountType,
          })
        : "主催団体の決済設定を確認できませんでした。";
      if (paidBlock) {
        return NextResponse.json({ message: paidBlock }, { status: 403 });
      }

      const latestStripeSession = await prisma.entryCheckoutSession.findFirst({
        where: {
          entryId: result.entry.id,
          stripeCheckoutSessionId: { not: null },
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: { stripeCheckoutSessionId: true },
      });

      if (latestStripeSession?.stripeCheckoutSessionId) {
        try {
          const existingStripe = await stripe.checkout.sessions.retrieve(
            latestStripeSession.stripeCheckoutSessionId
          );
          if (
            existingStripe.payment_status === "paid" ||
            existingStripe.payment_status === "no_payment_required"
          ) {
            await finalizeEntryCheckoutSessionsFromStripeSession(existingStripe);
            const afterSync = await prisma.entryCheckoutSession.findFirst({
              where: {
                entryId: result.entry.id,
                status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] },
              },
              orderBy: { createdAt: "desc" },
              select: { status: true },
            });
            if (afterSync) {
              const userStatus = getEntryUserFacingStatus({
                status: result.entry.status,
                totalFee: result.entry.totalFee,
                checkoutSessions: [{ status: afterSync.status }],
                clubIndividualFeePaidAt: result.entry.clubIndividualFeePaidAt,
                organizerPostPayApprovedAt: result.entry.organizerPostPayApprovedAt,
                organizerManualPaidAt: result.entry.organizerManualPaidAt,
              });
              const completeUrl = `${stripeRedirectOrigin()}/competitions/${competitionId}/entry?completed=1&entryId=${result.entry.id}`;
              if (userStatus.businessEstablished) {
                await syncStartListSnapshotBeforeMarshal({
                  competitionId,
                  candidateEventIds: collectEventIdsFromEntrySavePayload(
                    entryItemsData,
                    teamEntriesData,
                    previousEntryEventIds
                  ),
                  createdByUserId: session.userId,
                  trigger: "ENTRY_SAVE",
                  request,
                });
              }
              return NextResponse.json({
                message: userStatus.businessEstablished
                  ? "決済が確認できました。エントリーが成立しました。"
                  : "エントリー手続きを受け付けました",
                entryId: result.entry.id,
                totalFee: result.entry.totalFee,
                entryEstablished: userStatus.businessEstablished,
                entryStatusLabel: userStatus.userLabel,
                completeUrl,
              });
            }
            return NextResponse.json({
              message:
                "決済は完了しています。システムへの反映まで少しお待ちください。ページを更新してください。",
              entryId: result.entry.id,
              totalFee: result.entry.totalFee,
              entryEstablished: false,
              entryStatusLabel: "手続き完了（入金確認中）",
              pendingWebhookSync: true,
            });
          }
        } catch {
          // 新規 Checkout 作成へ進む
        }
      }

      const clientIp = getClientIpFromRequest(request);
      if (isStripeCheckoutClientIpBlocked(clientIp)) {
        return NextResponse.json(
          { message: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
          { status: 403 }
        );
      }
      try {
        await assertEntryStripeCheckoutRateLimit(session.userId);
      } catch {
        return NextResponse.json(
          { message: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
          { status: 429 }
        );
      }

      const entryUser = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { email: true },
      });

      // 請求: 参加費 B +（Stripe カード手数料相当の上乗せ S）。PF は B のみに課す（8% 等・STRIPE_PLATFORM_FEE_BPS）。
      // Connect: application_fee = PF(B) + S（S はプラットフォームが確保し、主催の取り分は B から PF を引いた水準に揃える）。
      const processingFeeBps = getStripeProcessingFeeBpsFromEnv();
      const processingFeeYen = stripeProcessingFeeSurchargeYenFromBps(totalFee, processingFeeBps);
      const checkoutTotalYen = totalFee + processingFeeYen;
      const platformFeeOnEntry = applicationFeeAmountYen(totalFee);
      const applicationFeeWithProcessing =
        platformFeeOnEntry + processingFeeYen;

      const entryCheckoutSession = await prisma.entryCheckoutSession.create({
        data: {
          competitionId,
          clubId: typeof clubId === "string" ? clubId : null,
          userId: session.userId,
          amount: checkoutTotalYen,
          entryId: result.entry.id,
          payload: {
            entryId: result.entry.id,
            competitionId,
            entryFeeYen: totalFee,
            processingFeeYen,
            processingFeeBps,
            checkoutTotalYen,
          },
        },
      });

      const origin = stripeRedirectOrigin();
      let checkoutSession: Stripe.Checkout.Session;
      const skipConnectEnv = connectRequirementSkipped();
      const connectCheckoutParams = resolveEntryCheckoutStripeConnectParams({
        skipConnectEnv,
        stripeSettlementAccountType: competition.stripeSettlementAccountType,
        org: orgBilling,
        applicationFeeWithProcessing,
      });

      try {
        checkoutSession = await createPaymentCheckout({
          organizationId: competition.organizationId,
          userId: session.userId,
          amount: checkoutTotalYen,
          description: `${competition.name} エントリー費`,
          lineItemSplit:
            processingFeeYen > 0
              ? {
                  primaryProductName: `${competition.name} エントリー費`,
                  entryYen: totalFee,
                  processingFeeYen,
                }
              : undefined,
          customerEmail: entryUser?.email ?? null,
          destinationConnectAccountId: connectCheckoutParams.destinationConnectAccountId,
          applicationFeeAmountYen: connectCheckoutParams.applicationFeeAmountYen,
          metadata: {
            entryCheckoutSessionId: entryCheckoutSession.id,
            entryId: result.entry.id,
            competitionId,
            userId: session.userId,
            entryFeeYen: String(totalFee),
            processingFeeYen: String(processingFeeYen),
            processingFeeBps: String(processingFeeBps),
          },
          successUrl: `${origin}/competitions/${competitionId}/entry?completed=1&entryId=${result.entry.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/competitions/${competitionId}/entry?payment=cancel&entryId=${result.entry.id}`,
        });
      } catch (stripeErr) {
        console.error("Stripe checkout.sessions.create (entry) failed", stripeErr);
        await prisma.entryCheckoutSession
          .delete({ where: { id: entryCheckoutSession.id } })
          .catch(() => {});
        return NextResponse.json(
          { message: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
          { status: 502 }
        );
      }

      await prisma.entryCheckoutSession.update({
        where: { id: entryCheckoutSession.id },
        data: {
          stripeCheckoutSessionId: checkoutSession.id,
          payload: {
            entryId: result.entry.id,
            competitionId,
            stripeCheckoutSessionId: checkoutSession.id,
          },
        },
      });

      return NextResponse.json({
        message: result.wasUpdate
          ? "エントリー内容を更新しました。決済完了後にエントリー成立となります。"
          : "決済完了後にエントリー成立となります。決済に進んでください。",
        entryId: result.entry.id,
        totalFee: result.entry.totalFee,
        entryEstablished: false,
        entryStatusLabel: "手続き完了（入金確認中）",
        checkoutUrl: checkoutSession.url,
      });
    }

    const completeUrl = `${stripeRedirectOrigin()}/competitions/${competitionId}/entry?completed=1&entryId=${result.entry.id}`;
    const userStatus = getEntryUserFacingStatus({
      status: result.entry.status,
      totalFee: result.entry.totalFee,
      checkoutSessions: latestCompletedCheckout
        ? [{ status: latestCompletedCheckout.status }]
        : [],
      clubIndividualFeePaidAt: result.entry.clubIndividualFeePaidAt,
      organizerPostPayApprovedAt: result.entry.organizerPostPayApprovedAt,
      organizerManualPaidAt: result.entry.organizerManualPaidAt,
    });

    if (userStatus.businessEstablished) {
      await syncStartListSnapshotBeforeMarshal({
        competitionId,
        candidateEventIds: collectEventIdsFromEntrySavePayload(
          entryItemsData,
          teamEntriesData,
          previousEntryEventIds
        ),
        createdByUserId: session.userId,
        trigger: "ENTRY_SAVE",
        request,
      });
    }

    return NextResponse.json({
      message: result.wasUpdate
        ? "エントリー内容を更新しました"
        : userStatus.businessEstablished
          ? "エントリーが成立しました"
          : "エントリー手続きを受け付けました",
      entryId: result.entry.id,
      totalFee: result.entry.totalFee,
      entryEstablished: userStatus.businessEstablished,
      entryStatusLabel: userStatus.userLabel,
      completeUrl,
    });
  } catch (error) {
    if (isPrismaPoolRetryable(error)) {
      return NextResponse.json({ message: prismaPoolBusyUserMessage() }, { status: 503 });
    }
    if (error instanceof Error) {
      const safeMessages = new Set([
        "種目が不正です",
        "個人種目のみ選択できます",
        "チーム種目のみ選択できます",
        "性別条件を満たしていません",
        "年齢条件を満たしていません",
        "エントリータイムが必要です",
        "チーム名を入力してください",
        "未決済のためエントリー内容は変更できません。先に決済を完了してください。",
      ]);
      if (safeMessages.has(error.message)) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/entries/route.ts",
      error
    );
  }
}
