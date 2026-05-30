import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsAdminWriteAccess } from "@/lib/dayOpsAccess";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { resolveParticipantInHeatForDayOps } from "@/lib/heatDayOpsResolveParticipantInHeat";
import { loadStartListSnapshotPayloadWithFallback } from "@/lib/heatMarshalGate";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const ROUND = ["HEAT", "SEMI", "FINAL"] as const;
const statusSchema = z.enum(["CALLED", "PENDING"]);

const operationSchema = z
  .object({
    opKey: z.string().min(1).max(120),
    eventId: z.string().min(1),
    round: z.enum(ROUND),
    heatIndex: z.number().int().min(1),
    participantType: z.enum(["INDIVIDUAL", "TEAM"]),
    competitionEntryId: z.string().optional(),
    teamEntryId: z.string().optional(),
    teamMemberUserId: z.string().nullable().optional(),
    status: statusSchema,
    reason: z.string().trim().max(200).optional(),
    lastKnownUpdatedAt: z.string().datetime().nullable().optional(),
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
  });

const bulkSchema = z.object({
  operations: z.array(operationSchema).min(1).max(300),
});

type BulkOperation = z.infer<typeof operationSchema>;

function heatMarshalStateKey(eventId: string, round: ResultRound, heatIndex: number): string {
  return `${eventId}:${round}:${heatIndex}`;
}

function makeParticipantWhere(op: BulkOperation) {
  return {
    competitionId: "",
    eventId: op.eventId,
    participantType: op.participantType,
    competitionEntryId: op.participantType === "INDIVIDUAL" ? op.competitionEntryId ?? null : null,
    teamEntryId: op.participantType === "TEAM" ? op.teamEntryId ?? null : null,
    teamMemberUserId: op.participantType === "TEAM" ? op.teamMemberUserId ?? null : null,
    marshalRound: op.round as ResultRound,
  };
}

async function upsertCalled(
  tx: Prisma.TransactionClient,
  competitionId: string,
  actorUserId: string | null,
  op: BulkOperation
) {
  const where = makeParticipantWhere(op);
  const now = new Date();
  const existing = await tx.competitionParticipantStatus.findFirst({
    where: { ...where, competitionId },
    select: { id: true, status: true },
  });
  if (existing?.status && ["DNS", "WITHDRAWN", "DSQ"].includes(existing.status)) {
    return { ok: false as const, error: "DNS/棄権/失格の参加者は変更できません", code: "TERMINAL" };
  }
  if (existing?.status === "CALLED") {
    return { ok: true as const, alreadyMarshalled: true };
  }

  if (existing) {
    await tx.competitionParticipantStatus.update({
      where: { id: existing.id },
      data: {
        status: "CALLED",
        reason: op.reason?.trim() || "ヒートマーシャル（一括）",
        calledAt: now,
        updatedByUserId: actorUserId,
      },
    });
  } else {
    await tx.competitionParticipantStatus.create({
      data: {
        ...where,
        competitionId,
        status: "CALLED",
        reason: op.reason?.trim() || "ヒートマーシャル（一括）",
        calledAt: now,
        updatedByUserId: actorUserId,
      },
    });
  }
  await markMarshalStartedIfUnset(tx.event, op.eventId, now);
  return { ok: true as const, alreadyMarshalled: false };
}

async function revertPending(
  tx: Prisma.TransactionClient,
  competitionId: string,
  actorUserId: string | null,
  op: BulkOperation
) {
  const where = makeParticipantWhere(op);
  const existing = await tx.competitionParticipantStatus.findFirst({
    where: { ...where, competitionId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: true as const };
  if (["DNS", "WITHDRAWN", "DSQ"].includes(existing.status)) {
    return { ok: false as const, error: "DNS/棄権/失格の参加者は変更できません", code: "TERMINAL" };
  }
  await tx.competitionParticipantStatus.update({
    where: { id: existing.id },
    data: {
      status: "PENDING",
      reason: null,
      calledAt: null,
      updatedByUserId: actorUserId,
    },
  });
  return { ok: true as const };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const dayOps = await assertDayOpsAdminWriteAccess(competitionId, request);
    const parsed = bulkSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const successes: Array<{
      opKey: string;
      lane: number;
      label: string;
      status: "CALLED" | "PENDING";
      alreadyMarshalled?: boolean;
    }> = [];
    const failed: Array<{ opKey: string; error: string; errorCode?: string }> = [];

    const operations = parsed.data.operations;
    const snapshot = await loadStartListSnapshotPayloadWithFallback(competitionId);

    const uniqueHeatKeys = new Map<string, { eventId: string; round: ResultRound; heatIndex: number }>();
    for (const op of operations) {
      uniqueHeatKeys.set(heatMarshalStateKey(op.eventId, op.round, op.heatIndex), {
        eventId: op.eventId,
        round: op.round,
        heatIndex: op.heatIndex,
      });
    }
    const closedHeatKeys = new Set<string>();
    if (uniqueHeatKeys.size > 0) {
      const closedRows = await prisma.competitionHeatMarshalState.findMany({
        where: {
          competitionId,
          callClosedAt: { not: null },
          OR: [...uniqueHeatKeys.values()].map((h) => ({
            eventId: h.eventId,
            round: h.round,
            heatIndex: h.heatIndex,
          })),
        },
        select: { eventId: true, round: true, heatIndex: true },
      });
      for (const row of closedRows) {
        closedHeatKeys.add(heatMarshalStateKey(row.eventId, row.round, row.heatIndex));
      }
    }

    for (const op of operations) {
      try {
        if (closedHeatKeys.has(heatMarshalStateKey(op.eventId, op.round, op.heatIndex))) {
          failed.push({
            opKey: op.opKey,
            error: "このヒートは召集締切済みです",
            errorCode: "MARSHAL_HEAT_CLOSED",
          });
          continue;
        }

        const resolved = await resolveParticipantInHeatForDayOps({
          competitionId,
          eventId: op.eventId,
          round: op.round,
          heatIndex: op.heatIndex,
          snapshot,
          body: {
            mode: "manual",
            participantType: op.participantType,
            competitionEntryId: op.competitionEntryId,
            teamEntryId: op.teamEntryId,
            teamMemberUserId: op.teamMemberUserId ?? undefined,
          },
        });
        if (!resolved.ok) {
          failed.push({
            opKey: op.opKey,
            error: resolved.error,
            errorCode: resolved.errorCode,
          });
          continue;
        }

        const where = makeParticipantWhere(op);
        const existing = await prisma.competitionParticipantStatus.findFirst({
          where: { ...where, competitionId },
          select: { updatedAt: true, status: true },
        });

        if (existing?.status === op.status) {
          successes.push({
            opKey: op.opKey,
            lane: resolved.data.slot.lane,
            label: resolved.data.slot.label,
            status: op.status,
            ...(op.status === "CALLED" ? { alreadyMarshalled: true } : {}),
          });
          continue;
        }

        if (op.lastKnownUpdatedAt && existing?.updatedAt) {
          const current = new Date(existing.updatedAt).getTime();
          const known = new Date(op.lastKnownUpdatedAt).getTime();
          if (Number.isFinite(current) && Number.isFinite(known) && current !== known) {
            failed.push({
              opKey: op.opKey,
              error: "他端末で更新されました。最新状態を再読み込みしてください",
              errorCode: "CONFLICT_UPDATED_AT",
            });
            continue;
          }
        }

        const txResult = await prisma.$transaction(async (tx) => {
          if (op.status === "CALLED") {
            return upsertCalled(tx, competitionId, dayOps.operatorUserId, op);
          }
          return revertPending(tx, competitionId, dayOps.operatorUserId, op);
        });

        if (!txResult.ok) {
          failed.push({ opKey: op.opKey, error: txResult.error, errorCode: txResult.code });
          continue;
        }

        successes.push({
          opKey: op.opKey,
          lane: resolved.data.slot.lane,
          label: resolved.data.slot.label,
          status: op.status,
          ...(op.status === "CALLED"
            ? { alreadyMarshalled: (txResult as { alreadyMarshalled?: boolean }).alreadyMarshalled }
            : {}),
        });
      } catch (error) {
        failed.push({
          opKey: op.opKey,
          error: error instanceof Error ? error.message : "更新に失敗しました",
          errorCode: "UNKNOWN",
        });
      }
    }

    return NextResponse.json({ success: successes, failed });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/participant-statuses/bulk/route.ts",
      error
    );
  }
}

