import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { countCalledMarshalSlotsForHeatConfirmInTransaction } from "@/lib/marshalHeatCalledCount";
import {
  resolveAdvanceQuotaForHeatInDayOps,
  validateHeatResultConfirmInTransaction,
} from "@/lib/heatResultEliminationRunUp";
import { reconcileOfficialDsqRowsForHeat } from "@/lib/officialResultDsqSync";
import { tryAutoAppendNextStartListRound } from "@/lib/startListNextRoundFromOfficial";
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

    const [eventRow, snapshot] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: { id: true, startListHeatPlanConfirmedAt: true },
      }),
      loadStartListSnapshotPayload(competitionId),
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

    const advanceQuota = await resolveAdvanceQuotaForHeatInDayOps({
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      snapshot,
    });

    const row = await prisma.$transaction(async (tx) => {
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

      const calledInHeat = await countCalledMarshalSlotsForHeatConfirmInTransaction({
        tx,
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
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

      await reconcileOfficialDsqRowsForHeat(tx, {
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        snapshot,
      });

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
    });

    await logAuditAction({
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

    if (round === "HEAT" || round === "SEMI") {
      void tryAutoAppendNextStartListRound({
        competitionId,
        eventId,
        finishedRound: round,
      })
        .then((append) => {
          if (!append.ok) {
            console.warn("start-list auto-append after heat confirm:", append.error);
          }
        })
        .catch((e) => {
          console.error("start-list auto-append after heat confirm failed:", e);
        });
    }

    return NextResponse.json({ ok: true, heatIndex });
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
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/confirm-heat/route.ts",
      error
    );
  }
}
