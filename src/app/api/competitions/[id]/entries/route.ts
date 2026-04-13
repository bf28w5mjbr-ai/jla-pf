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
import { connectRequirementSkipped, paidEntryCheckoutBlockReason } from "@/lib/organizerBilling";
import { refreshOrganizationStripeConnectFlags } from "@/lib/organizerStripeConnect";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import { ENTRY_CHECKOUT_PAID_STATUSES } from "@/lib/entryCheckoutSessionPaid";
import { finalizeEntryCheckoutSessionsFromStripeSession } from "@/lib/entryCheckoutStripeFinalize";
import { refreshStartListSnapshotAfterEligibleEntryChange } from "@/lib/startListSnapshot";
import { clearIndividualWithdrawalParticipantStatusesForEvents } from "@/lib/entryWithdrawalReinstatement";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { calculateCompetitionEntryFee, type CompetitionEntryFeeConfig } from "@/lib/entryFee";
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  competitionUsesUnderAgeSystem,
  partitionUnderBandsForCompetition,
} from "@/lib/competitionUnderAgeSettings";
import { meetsCompetitionEventAgeEligibility } from "@/lib/underAgeEventEligibility";
import { resolveEffectiveUnderBandAllowListForEvent } from "@/lib/underBandAllowList";
import {
  isTieredEntryFee,
  isTieredRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseUnderFeeTiers,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
} from "@/lib/competitionEntryAgeTiered";

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
    const teamEntriesArray = Array.isArray(teamEntries) ? teamEntries : [];
    const selectedCount = itemsArray.length + teamEntriesArray.length;

    if (selectedCount === 0) {
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
              select: { id: true, underBandKeysEnabled: true },
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
            underBandKeysEnabled: true,
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

    if (requireClubMembership && (!clubId || typeof clubId !== "string")) {
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

    const isAdmin = hasOrgAdminAccess(competition.organization.admins);

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
    const underPartition = partitionUnderBandsForCompetition(competition);
    const userSex = user?.sex ?? "OTHER";
    const userQualifications = user?.qualifications?.map((q) => q.kind) ?? [];

    const rq = resolveRequiredQualificationsForAge(
      competition.requiredQualifications,
      userAge,
      { underPartition: underPartition ?? null }
    );
    if (rq.tierMissing && isTieredRequiredQualifications(competition.requiredQualifications)) {
      return NextResponse.json(
        {
          message: user?.dateOfBirth
            ? "出場資格の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
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

    const invalidTeamEvent = teamEntriesArray.find((item: { eventId?: string }) => {
      const id = item.eventId;
      if (typeof id !== "string") return true;
      return !eventMap.has(id);
    });
    if (invalidTeamEvent) {
      return NextResponse.json({ message: "種目が不正です" }, { status: 400 });
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

    const entryItemsData = itemsArray.map((item: { eventId: string; entryTime?: string | null }) => {
      const event = eventMap.get(item.eventId);
      if (!event) {
        throw new Error("種目が不正です");
      }
      if (event.type !== "INDIVIDUAL") {
        throw new Error("個人種目のみ選択できます");
      }
      const isMixedEvent = event.sex === "OTHER";
      if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
        throw new Error("性別条件を満たしていません");
      }
      if (
        !meetsCompetitionEventAgeEligibility({
          competitionUnderAgeEnabled: competitionUsesUnderAgeSystem(competition),
          underPartition,
          eventUnderAgeEligibilityEnabled: event.underAgeEligibilityEnabled ?? true,
          effectiveUnderBandAllowList: resolveEffectiveUnderBandAllowListForEvent({
            underBandKeysOverride: event.underBandKeysOverride,
            ageCategoryId: event.ageCategoryId,
            categoryUnderBandKeysEnabled: event.ageCategory?.underBandKeysEnabled ?? null,
          }),
          event,
          userDateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth) : null,
          seasonalAgeYears: userAge,
        })
      ) {
        throw new Error("年齢条件を満たしていません");
      }
      if (event.requiresEntryTime && (!item.entryTime || !item.entryTime.trim())) {
        throw new Error("エントリータイムが必要です");
      }

      return {
        eventId: event.id,
        entryTime: item.entryTime?.trim() || null,
      };
    });

    const teamEntriesData = teamEntriesArray.map(
      (item: { eventId: string; teamName?: string }) => {
      const event = eventMap.get(item.eventId);
      if (!event) {
        throw new Error("種目が不正です");
      }
      if (event.type !== "TEAM") {
        throw new Error("チーム種目のみ選択できます");
      }
      const isMixedEvent = event.sex === "OTHER";
      if (!isMixedEvent && userSex !== "OTHER" && event.sex !== userSex) {
        throw new Error("性別条件を満たしていません");
      }
      if (
        !meetsCompetitionEventAgeEligibility({
          competitionUnderAgeEnabled: competitionUsesUnderAgeSystem(competition),
          underPartition,
          eventUnderAgeEligibilityEnabled: event.underAgeEligibilityEnabled ?? true,
          effectiveUnderBandAllowList: resolveEffectiveUnderBandAllowListForEvent({
            underBandKeysOverride: event.underBandKeysOverride,
            ageCategoryId: event.ageCategoryId,
            categoryUnderBandKeysEnabled: event.ageCategory?.underBandKeysEnabled ?? null,
          }),
          event,
          userDateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth) : null,
          seasonalAgeYears: userAge,
        })
      ) {
        throw new Error("年齢条件を満たしていません");
      }
      if (!item.teamName || typeof item.teamName !== "string" || !item.teamName.trim()) {
        throw new Error("チーム名を入力してください");
      }

      return {
        eventId: event.id,
        teamName: item.teamName.trim(),
      };
    });

    const userDob = user?.dateOfBirth ? new Date(user.dateOfBirth) : null;
    const feeUnits = resolveEntryFeeUnits(competition.entryFee, userAge, {
      userDateOfBirth: userDob,
      competitionAgeCategories: competition.ageCategories,
      underFeePartition: underPartition ?? null,
    });
    if (
      feeUnits.ageTierMissing &&
      isTieredEntryFee(competition.entryFee) &&
      entryItemsData.length + teamEntriesData.length > 0
    ) {
      const isCat = parseAgeCategoryFeeTiers(competition.entryFee) !== null;
      const isUnder = parseUnderFeeTiers(competition.entryFee) !== null;
      return NextResponse.json(
        {
          message: isCat
            ? user?.dateOfBirth
              ? "参加費の年齢カテゴリに、あなたの生年月日が該当する区分がありません。主催者へお問い合わせください。"
              : "この大会は年齢カテゴリ別の参加費です。プロフィールに生年月日を登録してください。"
            : isUnder
              ? user?.dateOfBirth
                ? "参加費のアンダー区分に、あなたの年度年齢が該当する区分がありません。主催者へお問い合わせください。"
                : "この大会はアンダー区分別の参加費です。プロフィールに生年月日を登録してください。"
              : user?.dateOfBirth
                ? "参加費の年齢帯に、あなたの年齢が含まれていません。主催者へお問い合わせください。"
                : "この大会は年齢帯別の参加費です。プロフィールに生年月日を登録してください。",
        },
        { status: 400 }
      );
    }

    const totalFee = calculateCompetitionEntryFee(
      competition.entryFee as CompetitionEntryFeeConfig | number | null,
      {
        individualCount: entryItemsData.length,
        teamCount: teamEntriesData.length,
      },
      {
        userAgeYearsAtCompetitionStart: userAge,
        userDateOfBirth: userDob,
        competitionAgeCategories: competition.ageCategories,
        underFeePartition: underPartition ?? null,
      }
    );

    if (totalFee > 0 && (!clubId || typeof clubId !== "string")) {
      return NextResponse.json(
        { message: "決済を行う場合は所属クラブが必要です" },
        { status: 400 }
      );
    }

    const entrySnapshot = {
      notes: typeof notes === "string" ? notes.trim() : null,
      items: entryItemsData,
      teamEntries: teamEntriesData,
      clubId: clubId ?? null,
    };

    const result = await prisma.$transaction(async (tx) => {
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
        individualEventIds: entryItemsData.map((row) => row.eventId),
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

      return {
        entry,
        wasUpdate: Boolean(existingEntry),
      };
    });

    const latestCompletedCheckout = await prisma.entryCheckoutSession.findFirst({
      where: {
        entryId: result.entry.id,
        status: { in: [...ENTRY_CHECKOUT_PAID_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });

    if (totalFee > 0 && !latestCompletedCheckout) {
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
        ? paidEntryCheckoutBlockReason(orgBilling)
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
              });
              const completeUrl = `${stripeRedirectOrigin()}/competitions/${competitionId}/entry?completed=1&entryId=${result.entry.id}`;
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

      const entryCheckoutSession = await prisma.entryCheckoutSession.create({
        data: {
          competitionId,
          clubId: clubId as string,
          userId: session.userId,
          amount: totalFee,
          entryId: result.entry.id,
          payload: {
            entryId: result.entry.id,
            competitionId,
          },
        },
      });

      const origin = stripeRedirectOrigin();
      let checkoutSession: Stripe.Checkout.Session;
      const skipConnect = connectRequirementSkipped();
      try {
        checkoutSession = await createPaymentCheckout({
          organizationId: competition.organizationId,
          userId: session.userId,
          amount: totalFee,
          description: `${competition.name} エントリー費`,
          customerEmail: entryUser?.email ?? null,
          destinationConnectAccountId: skipConnect ? null : orgBilling?.stripeConnectAccountId ?? null,
          applicationFeeAmountYen: skipConnect ? null : applicationFeeAmountYen(totalFee),
          metadata: {
            entryCheckoutSessionId: entryCheckoutSession.id,
            entryId: result.entry.id,
            competitionId,
            userId: session.userId,
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
    });

    if (userStatus.businessEstablished) {
      void refreshStartListSnapshotAfterEligibleEntryChange(competitionId).catch((e) =>
        console.error("refreshStartListSnapshotAfterEligibleEntryChange", competitionId, e)
      );
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
