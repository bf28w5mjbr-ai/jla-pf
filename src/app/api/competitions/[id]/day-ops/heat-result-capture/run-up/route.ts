import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  countHeatResultRows,
  eliminationSlots,
  listCalledSlotsMissingOkResultRow,
  resolveAdvanceQuotaForHeatInDayOps,
} from "@/lib/heatResultEliminationRunUp";
import { countCalledMarshalSlotsForHeatConfirmInTransaction } from "@/lib/marshalHeatCalledCount";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(["HEAT", "SEMI", "FINAL"]),
  heatIndex: z.number().int().min(1),
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

    const { eventId, round, heatIndex } = parsed.data;
    const roundDb = round as ResultRound;

    const eventRow = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true, startListHeatPlanConfirmedAt: true },
    });
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

    const snapshot = await loadStartListSnapshotPayload(competitionId);
    const quota = await resolveAdvanceQuotaForHeatInDayOps({
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      snapshot,
    });
    if (quota == null) {
      return NextResponse.json(
        { error: "このヒートのアップ枠が算出できないため、ランアップを登録できません" },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.officialResult.findUnique({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round: roundDb },
        },
        select: { id: true, lockedAt: true },
      });
      if (existing?.lockedAt) {
        throw new Error("OFFICIAL_RESULT_LOCKED");
      }

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

      const calledInHeat = await countCalledMarshalSlotsForHeatConfirmInTransaction({
        tx,
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
      });

      const existingRows = await tx.officialResultRow.findMany({
        where: {
          officialResultId: officialResult.id,
          heat: heatIndex,
          status: "OK",
        },
        select: { heat: true, rank: true, advanceWithoutRank: true },
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
      });
      if (toCreate.length === 0) {
        throw new Error("RUN_UP_NO_TARGETS");
      }

      const maxRunUp = slots.runUpTarget - runUpCount;
      const createSlice = toCreate.slice(0, maxRunUp);
      if (createSlice.length === 0) {
        throw new Error("RUN_UP_NO_TARGETS");
      }

      for (const slot of createSlice) {
        await tx.officialResultRow.create({
          data: {
            officialResultId: officialResult.id,
            entryType:
              slot.target.participantType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM",
            competitionEntryId: slot.target.competitionEntryId,
            teamEntryId: slot.target.teamEntryId,
            rank: null,
            advanceWithoutRank: true,
            status: "OK",
            heat: heatIndex,
            lane: slot.lane,
            unit: "OTHER",
          },
        });
      }

      return { createdCount: createSlice.length, officialResultId: officialResult.id };
    });

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
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, createdCount: result.createdCount });
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
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/run-up/route.ts",
      error
    );
  }
}
