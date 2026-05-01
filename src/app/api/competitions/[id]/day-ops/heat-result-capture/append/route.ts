import { jsonInternalError500 } from "@/lib/apiInternalError";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  DAY_OPS_STATUS_MARSHAL_ABSENT,
  effectiveDayOpsStatusForMarshalDisplay,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { loadStartListSnapshotPayload, loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import { computeDescInputCalledBaselineInHeat } from "@/lib/marshalHeatCalledCount";
import { resolveParticipantInHeatForDayOps } from "@/lib/heatDayOpsResolveParticipantInHeat";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const ROUND = ["HEAT", "SEMI", "FINAL"] as const;

const appendSchema = z.union([
  z.object({
    mode: z.literal("nfc"),
    eventId: z.string().min(1),
    round: z.enum(ROUND),
    heatIndex: z.number().int().min(1),
    nfcTagId: z.string().trim().min(1).max(128),
    tieWithPrevious: z.boolean().optional(),
    inputOrder: z.enum(["asc", "desc"]).optional(),
  }),
  z
    .object({
      mode: z.literal("manual"),
      eventId: z.string().min(1),
      round: z.enum(ROUND),
      heatIndex: z.number().int().min(1),
      participantType: z.enum(["INDIVIDUAL", "TEAM"]),
      competitionEntryId: z.string().optional(),
      teamEntryId: z.string().optional(),
      /** チーム種目の手動記録時は必須（resolveParticipantInHeatForDayOps と一致） */
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
    }),
]);

const reorderSchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(ROUND),
  heatIndex: z.number().int().min(1),
  order: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = appendSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const body = parsed.data;
    const eventId = body.eventId;
    const round = body.round as ResultRound;
    const heatIndex = body.heatIndex;

    const eventRow = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true, startListHeatPlanConfirmedAt: true },
    });
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        {
          error:
            "先にスタートリストでステップ1（ラウンド別ヒート数）を確定してください。",
        },
        { status: 409 }
      );
    }

    const resolvedSlot = await resolveParticipantInHeatForDayOps({
      competitionId,
      eventId,
      round,
      heatIndex,
      body:
        body.mode === "nfc"
          ? { mode: "nfc", nfcTagId: body.nfcTagId }
          : {
              mode: "manual",
              participantType: body.participantType,
              competitionEntryId: body.competitionEntryId,
              teamEntryId: body.teamEntryId,
              teamMemberUserId:
                body.participantType === "TEAM" ? body.teamMemberUserId?.trim() : undefined,
            },
    });
    if (!resolvedSlot.ok) {
      return NextResponse.json(
        {
          error: resolvedSlot.error,
          ...(resolvedSlot.errorCode ? { errorCode: resolvedSlot.errorCode } : {}),
        },
        { status: resolvedSlot.status }
      );
    }

    const { target, slot } = resolvedSlot.data;

    if (target.participantType === "INDIVIDUAL" && target.competitionEntryId) {
      const ok = await prisma.competitionEntry.findFirst({
        where: {
          id: target.competitionEntryId,
          competitionId,
          items: { some: { eventId } },
        },
        select: { id: true },
      });
      if (!ok) {
        return NextResponse.json(
          { error: "個人エントリーがこの種目に一致しません" },
          { status: 400 }
        );
      }
    }
    if (target.participantType === "TEAM" && target.teamEntryId) {
      const ok = await prisma.teamEntry.findFirst({
        where: { id: target.teamEntryId, competitionId, eventId },
        select: { id: true },
      });
      if (!ok) {
        return NextResponse.json(
          { error: "チームエントリーがこの種目に一致しません" },
          { status: 400 }
        );
      }
    }

    const [heatMarshalRow, dayOpsRow] = await Promise.all([
      prisma.competitionHeatMarshalState.findUnique({
        where: {
          competitionId_eventId_round_heatIndex: {
            competitionId,
            eventId,
            round,
            heatIndex,
          },
        },
        select: { callClosedAt: true },
      }),
      prisma.competitionParticipantStatus.findFirst({
        where: {
          competitionId,
          eventId,
          participantType: target.participantType,
          competitionEntryId: target.competitionEntryId ?? null,
          teamEntryId: target.teamEntryId ?? null,
          teamMemberUserId:
            target.participantType === "TEAM" ? target.teamMemberUserId ?? null : null,
          marshalRound: round,
        },
        select: { status: true },
      }),
    ]);
    const heatMarshalCallClosed = Boolean(heatMarshalRow?.callClosedAt);
    if (!heatMarshalCallClosed) {
      return NextResponse.json(
        {
          error:
            "マーシャル締切後にのみリザルトを記録できます。当日運用のヒート一覧で「このヒートを締切」を先に実行してください。",
        },
        { status: 409 }
      );
    }

    const storedStatus = dayOpsRow?.status ?? "PENDING";
    const effectiveStatus = effectiveDayOpsStatusForMarshalDisplay(
      storedStatus,
      heatMarshalCallClosed
    );
    if (storedStatus !== "CALLED") {
      if (effectiveStatus === DAY_OPS_STATUS_MARSHAL_ABSENT) {
        return NextResponse.json(
          {
            error:
              "マーシャル締切済みで未召集のため未出場扱いです（競技中の失格 DSQ とは別）。リザルトは記録できません。",
          },
          { status: 409 }
        );
      }
      if (storedStatus === "DSQ" || effectiveStatus === "DSQ") {
        return NextResponse.json(
          {
            error:
              "失格（DSQ）のためリザルトを記録できません。マーシャル未完了による未出場とは別扱いです。",
          },
          { status: 409 }
        );
      }
      if (storedStatus === "PENDING") {
        return NextResponse.json(
          {
            error:
              "マーシャル（召集チェック）が完了していないため、リザルトを記録できません",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error:
            "DB 上が CALLED（召集済み）になるまでリザルトを記録できません（CHECKED_IN 等は対象外です）",
        },
        { status: 409 }
      );
    }

    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.officialResult.findUnique({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round },
        },
        select: { id: true, lockedAt: true },
      });
      if (existing?.lockedAt) {
        throw new Error("OFFICIAL_RESULT_LOCKED");
      }

      const officialResult = await tx.officialResult.upsert({
        where: {
          competitionId_eventId_round: { competitionId, eventId, round },
        },
        create: {
          competitionId,
          eventId,
          round,
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

      const dupWhere =
        target.participantType === "INDIVIDUAL"
          ? {
              officialResultId: officialResult.id,
              heat: heatIndex,
              entryType: "INDIVIDUAL" as const,
              competitionEntryId: target.competitionEntryId,
            }
          : {
              officialResultId: officialResult.id,
              heat: heatIndex,
              entryType: "TEAM" as const,
              teamEntryId: target.teamEntryId,
            };

      const duplicate = await tx.officialResultRow.findFirst({
        where: dupWhere,
        select: { id: true, rank: true },
      });
      if (duplicate) {
        throw new Error("ALREADY_RANKED_IN_HEAT");
      }

      const agg = await tx.officialResultRow.aggregate({
        where: {
          officialResultId: officialResult.id,
          heat: heatIndex,
          status: "OK",
        },
        _max: { rank: true },
        _count: { _all: true },
      });
      let nextRank = (agg._max.rank ?? 0) + 1;
      let tieGroup: string | null = null;
      if (body.tieWithPrevious === true) {
        const previous = await tx.officialResultRow.findFirst({
          where: {
            officialResultId: officialResult.id,
            heat: heatIndex,
            status: "OK",
          },
          orderBy: [{ rank: "desc" }, { createdAt: "desc" }],
          select: { id: true, rank: true, tieGroup: true },
        });
        if (!previous || previous.rank == null) {
          throw new Error("TIE_NEEDS_PREVIOUS_RESULT");
        }
        nextRank = previous.rank;
        tieGroup = previous.tieGroup ?? randomUUID();
        if (!previous.tieGroup) {
          await tx.officialResultRow.update({
            where: { id: previous.id },
            data: { tieGroup },
          });
        }
      }
      if (body.tieWithPrevious !== true && body.inputOrder === "desc") {
        const snapshot =
          (await loadStartListSnapshotPayload(competitionId)) ??
          (await loadStartListSnapshotPayloadLoose(competitionId));
        const calledInHeat = await computeDescInputCalledBaselineInHeat({
          tx,
          competitionId,
          eventId,
          round,
          heatIndex,
          heatMarshalCallClosed: true,
          snapshot,
        });
        if (calledInHeat <= 0) {
          throw new Error("DESC_INPUT_NO_CALLED");
        }
        nextRank = Math.max(1, calledInHeat - agg._count._all);
      }

      const created = await tx.officialResultRow.create({
        data: {
          officialResultId: officialResult.id,
          entryType: target.participantType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM",
          competitionEntryId: target.competitionEntryId,
          teamEntryId: target.teamEntryId,
          rank: nextRank,
          status: "OK",
          heat: heatIndex,
          lane: slot.lane,
          tieGroup,
          unit: "OTHER",
        },
        select: { id: true, rank: true, tieGroup: true },
      });

      await tx.competitionHeatResultCaptureEvent.create({
        data: {
          id: randomUUID(),
          competitionId,
          eventId,
          round,
          heatIndex,
          lane: slot.lane,
          rank: created.rank,
          tieGroup: created.tieGroup,
          source: body.mode === "nfc" ? "NFC" : "MANUAL",
          eventType: "APPEND",
          participantType: target.participantType,
          competitionEntryId: target.competitionEntryId,
          teamEntryId: target.teamEntryId,
          capturedByUserId: operatorUserId,
        },
      });

      return created;
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_RESULT_CAPTURE_APPEND",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "OfficialResultRow",
      targetId: row.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        mode: body.mode,
        tieWithPrevious: body.tieWithPrevious === true,
        inputOrder: body.inputOrder ?? "asc",
        lane: slot.lane,
        rank: row.rank,
        participantType: target.participantType,
        competitionEntryId: target.competitionEntryId,
        teamEntryId: target.teamEntryId,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      rank: row.rank,
      tieGroup: row.tieGroup ?? null,
      lane: slot.lane,
      label: slot.label,
      clubName: slot.clubName,
      participantType: target.participantType,
      competitionEntryId: target.competitionEntryId,
      teamEntryId: target.teamEntryId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "OFFICIAL_RESULT_LOCKED") {
      return NextResponse.json(
        { error: "公式結果が確定済みのため記録できません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "ALREADY_RANKED_IN_HEAT") {
      return NextResponse.json(
        { error: "このヒートではすでに順位が記録されています" },
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
    if (error instanceof Error && error.message === "HEAT_RESULT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートのリザルトは確定済みのため記録できません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/append/route.ts",
      error
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const patchCtx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const patchOperatorUserId = patchCtx.operatorUserId;

    const parsed = reorderSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }
    const { eventId, round, heatIndex, order } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.officialResult.findUnique({
        where: { competitionId_eventId_round: { competitionId, eventId, round } },
        select: { id: true, lockedAt: true },
      });
      if (!existing) throw new Error("RESULT_NOT_FOUND");
      if (existing.lockedAt) throw new Error("OFFICIAL_RESULT_LOCKED");

      const heatConfirmedRow = await tx.officialResultHeatConfirmed.findUnique({
        where: {
          officialResultId_heat: {
            officialResultId: existing.id,
            heat: heatIndex,
          },
        },
        select: { id: true },
      });
      if (heatConfirmedRow) throw new Error("HEAT_RESULT_CONFIRMED");

      const rows = await tx.officialResultRow.findMany({
        where: {
          officialResultId: existing.id,
          heat: heatIndex,
          status: "OK",
          rank: { not: null },
        },
        select: {
          id: true,
          rank: true,
          entryType: true,
          competitionEntryId: true,
          teamEntryId: true,
        },
      });

      const keyOf = (r: (typeof rows)[number]) =>
        r.entryType === "INDIVIDUAL" ? `I:${r.competitionEntryId}` : `T:${r.teamEntryId}`;
      const byKey = new Map(rows.map((r) => [keyOf(r), r]));

      if (rows.length !== order.length) throw new Error("REORDER_INVALID_LENGTH");
      if (new Set(order).size !== order.length) throw new Error("REORDER_DUPLICATED_KEYS");
      for (const key of order) {
        if (!byKey.has(key)) throw new Error("REORDER_INVALID_KEY");
      }

      for (let i = 0; i < order.length; i += 1) {
        const key = order[i]!;
        const row = byKey.get(key)!;
        const nextRank = i + 1;
        await tx.officialResultRow.update({
          where: { id: row.id },
          data: { rank: nextRank, tieGroup: null },
        });
      }

      return { officialResultId: existing.id, updatedCount: order.length };
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_RESULT_REORDER",
      actorType: patchOperatorUserId ? "USER" : "SYSTEM",
      actorKey: patchOperatorUserId ? `user:${patchOperatorUserId}` : "dayops:unlock",
      actorUserId: patchOperatorUserId ?? undefined,
      targetType: "OfficialResult",
      targetId: result.officialResultId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        updatedCount: result.updatedCount,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, updatedCount: result.updatedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "RESULT_NOT_FOUND") {
      return NextResponse.json({ error: "対象の結果が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "OFFICIAL_RESULT_LOCKED") {
      return NextResponse.json(
        { error: "公式結果が確定済みのため並べ替えできません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "HEAT_RESULT_CONFIRMED") {
      return NextResponse.json(
        { error: "このヒートのリザルトは確定済みのため並べ替えできません" },
        { status: 409 }
      );
    }
    if (
      error instanceof Error &&
      (error.message === "REORDER_INVALID_LENGTH" ||
        error.message === "REORDER_DUPLICATED_KEYS" ||
        error.message === "REORDER_INVALID_KEY")
    ) {
      return NextResponse.json(
        { error: "並べ替え順の指定が不正です。画面を更新して再試行してください。" },
        { status: 400 }
      );
    }
    return jsonInternalError500(
      "PATCH api/competitions/[id]/day-ops/heat-result-capture/append/route.ts",
      error
    );
  }
}
