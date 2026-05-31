import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const ROUND = ["HEAT", "SEMI", "FINAL"] as const satisfies readonly ResultRound[];

const bulkQuerySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(ROUND),
});

const singleQuerySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(ROUND),
  heatIndex: z.coerce.number().int().min(1),
});

const patchSchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(ROUND),
  heatIndex: z.number().int().min(1),
  marshalDraftPayload: z.unknown().optional(),
  resultDraftPayload: z.unknown().optional(),
});

/** 未確定のマーシャル／リザルト UI 状態をヒート単位で共有（確定後は DELETE 推奨） */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsRecorderWriteAccess(competitionId, request);

    const sp = request.nextUrl.searchParams;
    const heatIndexRaw = sp.get("heatIndex");
    const eventId = sp.get("eventId");
    const round = sp.get("round");

    const eventOk = await prisma.event.findFirst({
      where: { id: eventId ?? "", competitionId },
      select: { id: true },
    });

    if (heatIndexRaw == null || heatIndexRaw.trim() === "") {
      const parsed = bulkQuerySchema.safeParse({ eventId, round });
      if (!parsed.success) {
        return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
      }
      const bulk = parsed.data;
      if (!eventOk) {
        return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
      }

      const rows = await prisma.dayOpsHeatOperationDraft.findMany({
        where: {
          competitionId,
          eventId: bulk.eventId,
          round: bulk.round,
        },
        select: {
          heatIndex: true,
          marshalDraftPayload: true,
          resultDraftPayload: true,
          updatedAt: true,
        },
        orderBy: { heatIndex: "asc" },
      });

      return NextResponse.json({
        drafts: rows.map((row) => ({
          heatIndex: row.heatIndex,
          marshalDraftPayload: row.marshalDraftPayload ?? null,
          resultDraftPayload: row.resultDraftPayload ?? null,
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    }

    const parsed = singleQuerySchema.safeParse({
      eventId,
      round,
      heatIndex: heatIndexRaw,
    });
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }
    const { eventId: singleEventId, round: singleRound, heatIndex } = parsed.data;

    if (!eventOk) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    const row = await prisma.dayOpsHeatOperationDraft.findUnique({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId: singleEventId,
          round: singleRound,
          heatIndex,
        },
      },
      select: {
        marshalDraftPayload: true,
        resultDraftPayload: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      marshalDraftPayload: row?.marshalDraftPayload ?? null,
      resultDraftPayload: row?.resultDraftPayload ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
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
    return jsonInternalError500(
      "GET api/competitions/[id]/day-ops/heat-operation-draft/route.ts",
      error
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }
    const { eventId, round, heatIndex, marshalDraftPayload, resultDraftPayload } = parsed.data;

    if (marshalDraftPayload === undefined && resultDraftPayload === undefined) {
      return NextResponse.json(
        { error: "marshalDraftPayload または resultDraftPayload のどちらかが必要です" },
        { status: 400 }
      );
    }

    const eventOk = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true },
    });
    if (!eventOk) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    const data: Prisma.DayOpsHeatOperationDraftUncheckedUpdateInput = {
      updatedByUserId: operatorUserId ?? null,
    };
    if (marshalDraftPayload !== undefined) {
      data.marshalDraftPayload = marshalDraftPayload === null ? Prisma.JsonNull : marshalDraftPayload;
    }
    if (resultDraftPayload !== undefined) {
      data.resultDraftPayload = resultDraftPayload === null ? Prisma.JsonNull : resultDraftPayload;
    }

    const row = await prisma.dayOpsHeatOperationDraft.upsert({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId,
          round,
          heatIndex,
        },
      },
      create: {
        competitionId,
        eventId,
        round,
        heatIndex,
        marshalDraftPayload:
          marshalDraftPayload === undefined
            ? undefined
            : marshalDraftPayload === null
              ? Prisma.JsonNull
              : marshalDraftPayload,
        resultDraftPayload:
          resultDraftPayload === undefined
            ? undefined
            : resultDraftPayload === null
              ? Prisma.JsonNull
              : resultDraftPayload,
        updatedByUserId: operatorUserId ?? null,
      },
      update: data,
      select: {
        marshalDraftPayload: true,
        resultDraftPayload: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      marshalDraftPayload: row.marshalDraftPayload ?? null,
      resultDraftPayload: row.resultDraftPayload ?? null,
      updatedAt: row.updatedAt.toISOString(),
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
    return jsonInternalError500(
      "PATCH api/competitions/[id]/day-ops/heat-operation-draft/route.ts",
      error
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsRecorderWriteAccess(competitionId, request);

    const sp = request.nextUrl.searchParams;
    const parsed = singleQuerySchema.safeParse({
      eventId: sp.get("eventId"),
      round: sp.get("round"),
      heatIndex: sp.get("heatIndex"),
    });
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }
    const { eventId, round, heatIndex } = parsed.data;

    await prisma.dayOpsHeatOperationDraft.deleteMany({
      where: { competitionId, eventId, round, heatIndex },
    });

    return NextResponse.json({ ok: true });
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
    return jsonInternalError500(
      "DELETE api/competitions/[id]/day-ops/heat-operation-draft/route.ts",
      error
    );
  }
}
