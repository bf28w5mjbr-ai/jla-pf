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
import {
  countHeatResultRows,
  eliminationSlots,
  listCalledSlotsMissingOkResultRow,
  resolveAdvanceQuotaForHeatInDayOps,
} from "@/lib/heatResultEliminationRunUp";
import {
  countCalledMarshalSlotsForHeatConfirmInTransaction,
  fetchParticipantStatusesForMarshalEvent,
} from "@/lib/marshalHeatCalledCount";
import {
  resolveParticipantInHeatForDayOps,
  type HeatDayOpsResolvedSlot,
} from "@/lib/heatDayOpsResolveParticipantInHeat";
import {
  appendManualHeatResultsInTransaction,
  assertManualResultAppendAllowedWithGate,
  loadManualResultAppendGateForConfirm,
  type ManualResultAppendEntry,
} from "@/lib/heatResultCaptureManualAppend";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
} from "@/lib/heatMarshalFromSnapshot";
import { fetchTeamMembersMapForTeamIds } from "@/lib/teamMarshalExpand";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";
import { assertOfficialResultWritableForCompetition } from "@/lib/officialResultAutoLock";
import {
  DAY_OPS_HEAVY_TRANSACTION,
  isPrismaTransactionUnavailable,
  prismaPoolBusyUserMessage,
  withPrismaPoolRetryOnce,
} from "@/lib/prismaPool";

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
  /** 未確定チェックをランアップと同一リクエストで反映（往復を省略） */
  manualEntries: z.array(manualEntrySchema).max(128).optional(),
});

export type RunUpCreatedRow = {
  heat: number;
  lane: number;
  rank: null;
  advanceWithoutRank: true;
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

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
        select: { startListSettings: true },
      }),
    ]);
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        { error: START_LIST_STEP1_REQUIRED_SHORT_MESSAGE },
        { status: 409 }
      );
    }

    const heatMarshalRow = await prisma.competitionHeatMarshalState.findUnique({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId,
          round: roundDb,
          heatIndex,
        },
      },
      select: { callClosedAt: true },
    });
    if (!heatMarshalRow?.callClosedAt) {
      return NextResponse.json(
        {
          error:
            "マーシャル締切後にのみランアップを登録できます。マーシャルモードで「マーシャル締切」を先に実行してください。",
        },
        { status: 409 }
      );
    }

    const quota = await resolveAdvanceQuotaForHeatInDayOps({
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      snapshot,
      competition,
      event: eventRow,
    });
    if (quota == null) {
      return NextResponse.json(
        { error: "このヒートのアップ枠が算出できないため、ランアップを登録できません" },
        { status: 409 }
      );
    }

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
        ? (snapshot ??
          (await loadStartListSnapshotPayload(competitionId)) ??
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
        heatMarshalCallClosed: true,
      });
      if (!gateLoad.ok) {
        return NextResponse.json({ error: gateLoad.error }, { status: gateLoad.status });
      }
      for (const item of resolvedFlush) {
        const allowed = assertManualResultAppendAllowedWithGate({
          round: roundDb,
          resolved: item.resolved,
          gate: gateLoad.gate,
        });
        if (!allowed.ok) {
          return NextResponse.json({ error: allowed.error }, { status: allowed.status });
        }
      }
    }

    let appendedRows: Awaited<ReturnType<typeof appendManualHeatResultsInTransaction>> = [];

    const result = await withPrismaPoolRetryOnce(() =>
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
      await assertOfficialResultWritableForCompetition(tx, competitionId, existing?.lockedAt);

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

      const heatConfirmedRow = await tx.officialResultHeatConfirmed.findUnique({
        where: {
          officialResultId_heat: {
            officialResultId: officialResult.id,
            heat: heatIndex,
          },
        },
        select: { id: true },
      });
      if (heatConfirmedRow) {
        throw new Error("HEAT_RESULT_CONFIRMED");
      }

      const roundData = getRoundDataFromSnapshot(snapshot, eventId, roundDb);
      const heat = getHeatFromRoundData(roundData, heatIndex);
      const teamIds = new Set<string>();
      for (const p of heat?.participants ?? []) {
        if (p.kind === "TEAM" && p.teamEntryId) teamIds.add(p.teamEntryId);
      }
      const teamMembersByTeamId = await fetchTeamMembersMapForTeamIds(tx, [...teamIds]);

      const existingRows = await tx.officialResultRow.findMany({
        where: {
          officialResultId: officialResult.id,
          heat: heatIndex,
          status: "OK",
        },
        select: {
          heat: true,
          rank: true,
          advanceWithoutRank: true,
          entryType: true,
          competitionEntryId: true,
          teamEntryId: true,
        },
      });

      const calledInHeat = await countCalledMarshalSlotsForHeatConfirmInTransaction({
        tx,
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
        statusRows: eventStatusRows,
        heatMarshalCallClosed: true,
        teamMembersByTeamId,
      });

      const { rankedCount, runUpCount } = countHeatResultRows(existingRows, heatIndex);
      const slots = eliminationSlots({ called: calledInHeat, quota });
      if (!slots) {
        throw new Error("ELIMINATION_QUOTA_INVALID");
      }
      if (rankedCount < slots.eliminationTarget) {
        throw new Error("ELIMINATION_INCOMPLETE");
      }
      if (runUpCount >= slots.runUpTarget) {
        throw new Error("RUN_UP_ALREADY_COMPLETE");
      }

      const toCreate = await listCalledSlotsMissingOkResultRow({
        tx,
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        officialResultId: officialResult.id,
        snapshot,
        statusRows: eventStatusRows,
        heatMarshalCallClosed: true,
        existingOkRows: existingRows,
        teamMembersByTeamId,
      });
      if (toCreate.length === 0) {
        throw new Error("RUN_UP_NO_TARGETS");
      }

      const maxRunUp = slots.runUpTarget - runUpCount;
      const createSlice = toCreate.slice(0, maxRunUp);
      if (createSlice.length === 0) {
        throw new Error("RUN_UP_NO_TARGETS");
      }

      await tx.officialResultRow.createMany({
        data: createSlice.map((slot) => ({
          officialResultId: officialResult.id,
          entryType:
            slot.target.participantType === "INDIVIDUAL" ? ("INDIVIDUAL" as const) : ("TEAM" as const),
          competitionEntryId: slot.target.competitionEntryId,
          teamEntryId: slot.target.teamEntryId,
          rank: null,
          advanceWithoutRank: true,
          status: "OK" as const,
          heat: heatIndex,
          lane: slot.lane,
          unit: "OTHER" as const,
        })),
      });

      const created: RunUpCreatedRow[] = createSlice.map((slot) => ({
        heat: heatIndex,
        lane: slot.lane,
        rank: null,
        advanceWithoutRank: true as const,
        entryType:
          slot.target.participantType === "INDIVIDUAL" ? ("INDIVIDUAL" as const) : ("TEAM" as const),
        competitionEntryId: slot.target.competitionEntryId,
        teamEntryId: slot.target.teamEntryId,
      }));

      return {
        createdCount: createSlice.length,
        officialResultId: officialResult.id,
        created,
        appended: appendedRows,
      };
      }, DAY_OPS_HEAVY_TRANSACTION)
    );

    await logAuditAction({
      action: "COMPETITION_HEAT_RESULT_RUN_UP",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "OfficialResult",
      targetId: result.officialResultId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        createdCount: result.createdCount,
        manualEntriesFlushed: entriesToFlush.length,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      createdCount: result.createdCount,
      created: result.created,
      appended: result.appended.map((row) => ({
        rank: row.rank,
        lane: row.lane,
        participantType: row.participantType,
        competitionEntryId: row.competitionEntryId,
        teamEntryId: row.teamEntryId,
      })),
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
        { error: "種目全体の公式結果が確定済みのため、ランアップを登録できません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートはリザルト確定済みのため、ランアップを変更できません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "ELIMINATION_INCOMPLETE") {
      return NextResponse.json(
        {
          error:
            "脱落者の着順記録が足りません。下位からチェックで脱落分を入れてからランアップしてください。",
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "RUN_UP_ALREADY_COMPLETE") {
      return NextResponse.json(
        { error: "このヒートのランアップは既に登録済みです" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "RUN_UP_NO_TARGETS") {
      return NextResponse.json(
        { error: "ランアップ対象の召集済み参加者がいません" },
        { status: 409 }
      );
    }
    if (isPrismaTransactionUnavailable(error)) {
      return NextResponse.json({ error: prismaPoolBusyUserMessage() }, { status: 503 });
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/run-up/route.ts",
      error
    );
  }
}
