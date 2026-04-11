import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, ResultRound } from "@prisma/client";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { assertDayOpsAdminWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { resolveParticipantInHeatForDayOps } from "@/lib/heatDayOpsResolveParticipantInHeat";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const ROUND = ["HEAT", "SEMI", "FINAL"] as const;

const completeSchema = z.union([
  z.object({
    mode: z.literal("nfc"),
    eventId: z.string().min(1),
    round: z.enum(ROUND),
    heatIndex: z.number().int().min(1),
    nfcTagId: z.string().trim().min(1).max(128),
    reason: z.string().trim().max(200).optional(),
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
      /** チーム種目: 構成員（ユーザーID） */
      teamMemberUserId: z.string().optional(),
      reason: z.string().trim().max(200).optional(),
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
          message: "teamMemberUserIdが必要です（構成員単位のマーシャル）",
          path: ["teamMemberUserId"],
        });
      }
    }),
]);

async function upsertCalled(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    actorUserId: string;
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId: string | null;
    teamEntryId: string | null;
    teamMemberUserId: string | null;
    reason: string;
    now: Date;
  }
) {
  const {
    competitionId,
    eventId,
    round,
    actorUserId,
    participantType,
    competitionEntryId,
    teamEntryId,
    teamMemberUserId,
    reason,
    now,
  } = params;

  const existing = await tx.competitionParticipantStatus.findFirst({
    where: {
      competitionId,
      eventId,
      participantType,
      competitionEntryId: competitionEntryId ?? null,
      teamEntryId: teamEntryId ?? null,
      teamMemberUserId: teamMemberUserId ?? null,
      marshalRound: round,
    },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status === "DNS" || existing.status === "WITHDRAWN" || existing.status === "DSQ") {
      throw new Error("PARTICIPANT_STATUS_TERMINAL");
    }
    if (existing.status === "CALLED") {
      return { id: existing.id, alreadyMarshalled: true as const };
    }
    await tx.competitionParticipantStatus.update({
      where: { id: existing.id },
      data: {
        status: "CALLED",
        reason,
        calledAt: now,
        updatedByUserId: actorUserId,
      },
    });
    return { id: existing.id, alreadyMarshalled: false as const };
  }

  const created = await tx.competitionParticipantStatus.create({
    data: {
      competitionId,
      eventId,
      participantType,
      competitionEntryId,
      teamEntryId,
      teamMemberUserId,
      marshalRound: round,
      status: "CALLED",
      reason,
      calledAt: now,
      updatedByUserId: actorUserId,
    },
    select: { id: true },
  });
  return { id: created.id, alreadyMarshalled: false as const };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    await assertDayOpsAdminWriteAccess(competitionId, session.userId);

    const parsed = completeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const body = parsed.data;
    const eventId = body.eventId;
    const round = body.round as ResultRound;
    const heatIndex = body.heatIndex;
    const reason =
      body.reason?.trim() ||
      (body.mode === "nfc" ? "ヒートマーシャル（NFC）" : "ヒートマーシャル（手動）");

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
            "先にスタートリストでステップ1（ラウンド別ヒート数）を確定してください。確定後にマーシャル操作が可能になります。",
        },
        { status: 409 }
      );
    }

    const heatMarshalState = await prisma.competitionHeatMarshalState.findUnique({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId,
          round,
          heatIndex,
        },
      },
      select: { callClosedAt: true },
    });
    if (heatMarshalState?.callClosedAt) {
      return NextResponse.json(
        { error: "このヒートは召集締切済みのためマーシャル完了できません" },
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
              teamMemberUserId: body.teamMemberUserId,
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

    const now = new Date();
    let upsertResult!: { id: string; alreadyMarshalled: boolean };
    await prisma.$transaction(async (tx) => {
      upsertResult = await upsertCalled(tx, {
        competitionId,
        eventId,
        round,
        actorUserId: session.userId,
        participantType: target.participantType,
        competitionEntryId: target.competitionEntryId,
        teamEntryId: target.teamEntryId,
        teamMemberUserId: target.teamMemberUserId ?? null,
        reason,
        now,
      });
      if (!upsertResult.alreadyMarshalled) {
        await markMarshalStartedIfUnset(tx.event, eventId, now);
      }
    });

    await logAuditAction({
      action: "COMPETITION_HEAT_MARSHAL_COMPLETE",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "CompetitionParticipantStatus",
      targetId: upsertResult!.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        heatIndex,
        mode: body.mode,
        lane: slot.lane,
        participantType: target.participantType,
        competitionEntryId: target.competitionEntryId,
        teamEntryId: target.teamEntryId,
        teamMemberUserId: target.teamMemberUserId ?? null,
        alreadyMarshalled: upsertResult!.alreadyMarshalled,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      lane: slot.lane,
      label: slot.label,
      clubName: slot.clubName,
      alreadyMarshalled: upsertResult!.alreadyMarshalled,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "PARTICIPANT_STATUS_TERMINAL") {
      return NextResponse.json(
        { error: "DNS/棄権/失格の参加者はマーシャル完了できません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-marshal/complete/route.ts",
      error
    );
  }
}
