import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  loadStartListSnapshotPayload,
  loadStartListSnapshotPayloadLoose,
} from "@/lib/heatMarshalGate";
import { countCalledMarshalSlotsForHeatConfirmInTransaction, fetchParticipantStatusesForMarshalEvent } from "@/lib/marshalHeatCalledCount";
import {
  resolveAdvanceQuotaForHeatInDayOps,
  validateHeatResultConfirmInTransaction,
} from "@/lib/heatResultEliminationRunUp";
import {
  resolveParticipantInHeatForDayOps,
  type HeatDayOpsResolvedSlot,
} from "@/lib/heatDayOpsResolveParticipantInHeat";
import {
  appendManualHeatResultsInTransaction,
  assertManualResultAppendAllowedWithGate,
  isManualResultAppendTargetDsq,
  loadManualResultAppendGateForConfirm,
  type ManualResultAppendEntry,
} from "@/lib/heatResultCaptureManualAppend";
import { compactOkRanksForHeatInTransaction } from "@/lib/heatResultRankCompact";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import { reconcileOfficialDsqRowsForHeat } from "@/lib/officialResultDsqSync";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";
import {
  DAY_OPS_HEAVY_TRANSACTION,
  isPrismaTransactionUnavailable,
  prismaPoolBusyUserMessage,
  withPrismaPoolRetryOnce,
} from "@/lib/prismaPool";
import { assertOfficialResultWritable } from "@/lib/officialResultAutoLock";

type RouteContext = { params: Promise<{ id: string }> };

const manualEntrySchema = z
  .object({
    participantType: z.enum(["INDIVIDUAL", "TEAM"]),
    competitionEntryId: z.string().optional(),
    teamEntryId: z.string().optional(),
    teamMemberUserId: z.string().optional(),
    tieWithPrevious: z.boolean().optional(),
    inputOrder: z.enum(["asc", "desc"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.participantType === "INDIVIDUAL" && !val.competitionEntryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "competitionEntryIdが必要です",
        path: ["competitionEntryId"],
      });
    }
    if (val.participantType === "TEAM" && !val.teamEntryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "teamEntryIdが必要です",
        path: ["teamEntryId"],
      });
    }
    if (val.participantType === "TEAM" && !val.teamMemberUserId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "teamMemberUserId（構成員）が必要です",
        path: ["teamMemberUserId"],
      });
    }
  });

const bodySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(["HEAT", "SEMI", "FINAL"]),
  heatIndex: z.number().int().min(1),
  /** 未確定チェックを確定と同一リクエストで反映（往復を省略） */
  manualEntries: z.array(manualEntrySchema).max(128).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, round, heatIndex, manualEntries } = parsed.data;
    const roundDb = round as ResultRound;

    const [eventRow, snapshot, competition] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: {
          id: true,
          startListHeatPlanConfirmedAt: true,
          preliminaryHeatLaneCount: true,
          startListRoundCount: true,
        },
      }),
      loadStartListSnapshotPayload(competitionId),
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { startListSettings: true, endDate: true },
      }),
    ]);
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        { error: START_LIST_STEP1_REQUIRED_SHORT_MESSAGE },
        { status: 409 }
      );
    }

    const advanceQuota = await resolveAdvanceQuotaForHeatInDayOps({
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      snapshot,
      competition,
      event: eventRow,
    });

    const entriesToFlush = manualEntries ?? [];
    const resolvedFlush: Array<{
      resolved: HeatDayOpsResolvedSlot;
      entry: ManualResultAppendEntry;
    }> = [];
    let snapshotForDescInput: StartListSnapshotPayload | null = null;

    const eventStatusRowsPromise = fetchParticipantStatusesForMarshalEvent(
      prisma,
      competitionId,
      eventId
    );

    if (entriesToFlush.length > 0) {
      const needsDescSnapshot = entriesToFlush.some(
        (e) => e.tieWithPrevious !== true && e.inputOrder === "desc"
      );
      snapshotForDescInput = needsDescSnapshot
        ? (snapshot ?? (await loadStartListSnapshotPayload(competitionId)) ??
          (await loadStartListSnapshotPayloadLoose(competitionId)))
        : null;

      const resolvedSlots = await Promise.all(
        entriesToFlush.map((entry) =>
          resolveParticipantInHeatForDayOps({
            competitionId,
            eventId,
            round: roundDb,
            heatIndex,
            snapshot,
            body: {
              mode: "manual",
              participantType: entry.participantType,
              competitionEntryId: entry.competitionEntryId,
              teamEntryId: entry.teamEntryId,
              teamMemberUserId:
                entry.participantType === "TEAM" ? entry.teamMemberUserId?.trim() : undefined,
            },
          })
        )
      );
      for (let i = 0; i < entriesToFlush.length; i += 1) {
        const resolvedSlot = resolvedSlots[i]!;
        const entry = entriesToFlush[i]!;
        if (!resolvedSlot.ok) {
          return NextResponse.json(
            {
              error: resolvedSlot.error,
              ...(resolvedSlot.errorCode ? { errorCode: resolvedSlot.errorCode } : {}),
            },
            { status: resolvedSlot.status }
          );
        }
        resolvedFlush.push({ resolved: resolvedSlot.data, entry });
      }

      const gateLoad = await loadManualResultAppendGateForConfirm({
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        resolvedSlots: resolvedFlush.map((r) => r.resolved),
        eventStatusRows: await eventStatusRowsPromise,
      });
      if (!gateLoad.ok) {
        return NextResponse.json({ error: gateLoad.error }, { status: gateLoad.status });
      }
      const gate = gateLoad.gate;
      const filteredFlush: typeof resolvedFlush = [];
      for (const item of resolvedFlush) {
        if (isManualResultAppendTargetDsq({ round: roundDb, resolved: item.resolved, gate })) {
          continue;
        }
        const allowed = assertManualResultAppendAllowedWithGate({
          round: roundDb,
          resolved: item.resolved,
          gate,
        });
        if (!allowed.ok) {
          return NextResponse.json({ error: allowed.error }, { status: allowed.status });
        }
        filteredFlush.push(item);
      }
      resolvedFlush.length = 0;
      resolvedFlush.push(...filteredFlush);
    }

    let appendedRows: Awaited<ReturnType<typeof appendManualHeatResultsInTransaction>> = [];

    const row = await withPrismaPoolRetryOnce(() =>
      prisma.$transaction(async (tx) => {
      const eventStatusRows = await eventStatusRowsPromise;

      if (resolvedFlush.length > 0) {
        appendedRows = await appendManualHeatResultsInTransaction(tx, {
          competitionId,
          eventId,
          round: roundDb,
          heatIndex,
          operatorUserId,
          entries: resolvedFlush,
          snapshotForDescInput,
          eventStatusRows,
        });
      }
      const existing = await tx.officialResult.findUnique({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round: roundDb },
        },
        select: { id: true, lockedAt: true },
      });
      assertOfficialResultWritable(existing?.lockedAt, competition.endDate);

      const officialResult = await tx.officialResult.upsert({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round: roundDb },
        },
        create: {
          competitionId,
          eventId,
          round: roundDb,
          publishedAt: null,
          lockedAt: null,
        },
        update: {},
        select: { id: true },
      });

      await reconcileOfficialDsqRowsForHeat(tx, {
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
        statusRows: eventStatusRows,
      });

      await compactOkRanksForHeatInTransaction(tx, {
        officialResultId: officialResult.id,
        heatIndex,
      });

      const calledInHeat = await countCalledMarshalSlotsForHeatConfirmInTransaction({
        tx,
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
        statusRows: eventStatusRows,
      });

      if (calledInHeat > 0) {
        const okRows = await tx.officialResultRow.findMany({
          where: {
            officialResultId: officialResult.id,
            heat: heatIndex,
            status: "OK",
          },
          select: { rank: true, advanceWithoutRank: true },
        });
        const validation = validateHeatResultConfirmInTransaction({
          calledInHeat,
          quota: advanceQuota,
          rows: okRows,
        });
        if (!validation.ok) {
          throw new Error(validation.code);
        }
      }

      await tx.officialResultHeatConfirmed.upsert({
        where: {
          officialResultId_heat: {
            officialResultId: officialResult.id,
            heat: heatIndex,
          },
        },
        create: {
          officialResultId: officialResult.id,
          heat: heatIndex,
          confirmedByUserId: operatorUserId,
        },
        update: {},
      });

      return officialResult.id;
      }, DAY_OPS_HEAVY_TRANSACTION)
    );

    void logAuditAction({
      action: "COMPETITION_HEAT_RESULT_CONFIRM",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "OfficialResultHeatConfirmed",
      targetId: row,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      heatIndex,
      appended: appendedRows,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        {
          error:
            "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください",
        },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "OFFICIAL_RESULT_LOCKED") {
      return NextResponse.json(
        { error: "種目全体の公式結果が確定済みのため、ヒート単位の確定はできません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_INCOMPLETE_RANKS") {
      return NextResponse.json(
        {
          error:
            "このヒートでは召集済みの人数に足りる順位が記録されていません。全員分の着順を入れてから確定してください。",
        },
        { status: 409 }
      );
    }
    if (
      error instanceof Error &&
      (error.message === "HEAT_RESULT_INCOMPLETE_ELIMINATION" ||
        error.message === "HEAT_RESULT_INCOMPLETE_RUN_UP" ||
        error.message === "HEAT_RESULT_INCOMPLETE_ELIMINATION_OR_RUN_UP")
    ) {
      return NextResponse.json(
        {
          error:
            "脱落の着順とランアップ（残りの進出）が揃っていません。下位から脱落を記録し、「残りをランアップ」してから確定してください。",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートのリザルトは確定済みのため記録できません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "ALREADY_RANKED_IN_HEAT") {
      return NextResponse.json(
        { error: "このヒートではすでに順位が記録されています" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "ALREADY_RUN_UP_IN_HEAT") {
      return NextResponse.json(
        {
          error:
            "この参加者はランアップ（着順なし進出）済みです。脱落着順の記録はできません。ランアップ解除後に操作してください。",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "TIE_NEEDS_PREVIOUS_RESULT") {
      return NextResponse.json(
        { error: "同着は先行する着順がある場合のみ指定できます" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "DESC_INPUT_NO_CALLED") {
      return NextResponse.json(
        {
          error:
            "降順入力には、このヒートでマーシャル一覧に召集済（CALLED）と表示されている参加者が1名以上必要です。一覧を更新して状態を確認してください。",
          errorCode: "DESC_INPUT_NO_CALLED",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "RUN_UP_MUST_HAVE_NULL_RANK") {
      return NextResponse.json(
        {
          error:
            "ランアップ（着順なし進出）の行に着順が入っています。ランアップ解除後に再度確定してください。",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "RUN_UP_EXCEEDS_QUOTA") {
      return NextResponse.json(
        {
          error: "ランアップ人数が進出枠を超えています。ランアップ解除後に再度確定してください。",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "ELIMINATION_QUOTA_UNKNOWN") {
      return NextResponse.json(
        { error: "進出枠が未設定のため、脱落式リザルトを確定できません。" },
        { status: 409 }
      );
    }
    if (isPrismaTransactionUnavailable(error)) {
      return NextResponse.json({ error: prismaPoolBusyUserMessage() }, { status: 503 });
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/confirm-heat/route.ts",
      error
    );
  }
}
