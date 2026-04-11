import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  marshalParticipantRefAtLane,
} from "@/lib/heatMarshalFromSnapshot";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(["HEAT", "SEMI", "FINAL"]),
  heatIndex: z.number().int().min(1),
  lane: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500).optional(),
});

const DEFAULT_REASON = "失格管理からの失格申請";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, round, heatIndex, lane } = parsed.data;
    const reason = parsed.data.reason?.trim() || DEFAULT_REASON;
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
        { error: "先にスタートリストのステップ1を確定してください。" },
        { status: 409 }
      );
    }

    const snapshot = await loadStartListSnapshotPayload(competitionId);
    const roundData = getRoundDataFromSnapshot(snapshot, eventId, roundDb);
    const heat = getHeatFromRoundData(roundData, heatIndex);
    const target = marshalParticipantRefAtLane(heat, lane);
    if (!target) {
      return NextResponse.json(
        { error: "そのレーンに参加者がいません（スタートリストとレーン番号を確認してください）" },
        { status: 400 }
      );
    }

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

    const now = new Date();
    const participantBase = {
      competitionId,
      eventId,
      participantType: target.participantType,
      competitionEntryId: target.competitionEntryId ?? null,
      teamEntryId: target.teamEntryId ?? null,
    } as const;

    const upserted = await prisma.$transaction(async (tx) => {
      const terminalAny = await tx.competitionParticipantStatus.findFirst({
        where: {
          ...participantBase,
          status: { in: ["DNS", "WITHDRAWN", "DSQ"] },
        },
        select: { id: true, status: true },
      });
      if (terminalAny?.status === "DSQ") {
        return {
          id: terminalAny.id,
          status: "DSQ" as const,
          alreadyDsq: true as const,
        };
      }
      if (terminalAny) {
        throw new Error("PARTICIPANT_TERMINAL");
      }

      const existingRound = await tx.competitionParticipantStatus.findFirst({
        where: {
          ...participantBase,
          marshalRound: roundDb,
        },
        select: { id: true, status: true },
      });
      if (existingRound?.status === "DSQ") {
        return {
          id: existingRound.id,
          status: "DSQ" as const,
          alreadyDsq: true as const,
        };
      }

      const row = existingRound
        ? await tx.competitionParticipantStatus.update({
            where: { id: existingRound.id },
            data: {
              status: "DSQ",
              reason,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          })
        : await tx.competitionParticipantStatus.create({
            data: {
              ...participantBase,
              marshalRound: roundDb,
              status: "DSQ",
              reason,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          });

      await markMarshalStartedIfUnset(tx.event, eventId, now);
      return { id: row.id, status: row.status as "DSQ", alreadyDsq: false as const };
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_LANE_DSQ",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "CompetitionParticipantStatus",
      targetId: upserted.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        lane,
        reason,
        alreadyDsq: upserted.alreadyDsq,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      alreadyDsq: upserted.alreadyDsq,
      status: upserted.status,
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
    if (error instanceof Error && error.message === "PARTICIPANT_TERMINAL") {
      return NextResponse.json(
        { error: "DNS・棄権済みの参加者は失格に変更できません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-lane-dsq/route.ts",
      error
    );
  }
}
