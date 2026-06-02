import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { isCallClosedForEvent } from "@/lib/dayOpsCallWindow";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import {
  getClosedMarshalHeatIndices,
  isMarshalHeatCallClosed,
  loadStartListSnapshotPayload,
  resolveParticipantMarshalHeat,
} from "@/lib/heatMarshalGate";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import {
  clearOfficialRowAfterTerminalRevert,
  TERMINAL_DAY_OPS_STATUSES,
  type TerminalDayOpsStatus,
} from "@/lib/officialResultTerminalSync";
import { START_LIST_STEP1_REQUIRED_SHORT_MESSAGE } from "@/lib/startListStep1Messages";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    eventId: z.string().min(1),
    participantType: z.enum(["INDIVIDUAL", "TEAM"]),
    competitionEntryId: z.string().optional(),
    teamEntryId: z.string().optional(),
    targetStatus: z.enum(["PENDING", "CALLED"]),
    reason: z.string().trim().min(1).max(500),
    marshalRound: z.enum(["HEAT", "SEMI", "FINAL"]).optional(),
    fromStatus: z.enum(["DNS", "WITHDRAWN", "DSQ", "DNF"]).optional(),
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const ctx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = ctx.operatorUserId;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const {
      eventId,
      participantType,
      competitionEntryId,
      teamEntryId,
      targetStatus,
      reason,
      fromStatus,
    } = parsed.data;
    const marshalRound: ResultRound = parsed.data.marshalRound ?? "HEAT";

    const [competition, eventRow] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { startListSettings: true },
      }),
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: { id: true, startListHeatPlanConfirmedAt: true },
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

    const callClosed = isCallClosedForEvent(competition?.startListSettings, eventId);
    if (callClosed && targetStatus === "CALLED") {
      return NextResponse.json(
        { error: "この種目は召集締切済みのため、召集済み（CALLED）には戻せません" },
        { status: 409 }
      );
    }

    if (targetStatus === "CALLED") {
      const [snapshot, closedHeats] = await Promise.all([
        loadStartListSnapshotPayload(competitionId),
        getClosedMarshalHeatIndices(prisma, competitionId, eventId, marshalRound),
      ]);
      const heatIndex = resolveParticipantMarshalHeat(snapshot, eventId, marshalRound, {
        participantType,
        competitionEntryId: competitionEntryId ?? null,
        teamEntryId: teamEntryId ?? null,
      });
      if (heatIndex != null && isMarshalHeatCallClosed(closedHeats, heatIndex)) {
        return NextResponse.json(
          {
            error: `このラウンドのヒート${heatIndex}は召集締切済みのため、召集済み（CALLED）には戻せません`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    const note = `終了ステータス取り消し: ${reason}`;

    const snapshotForRevert = await loadStartListSnapshotPayload(competitionId);
    const heatIndexForRevert = resolveParticipantMarshalHeat(
      snapshotForRevert,
      eventId,
      marshalRound,
      {
        participantType,
        competitionEntryId: competitionEntryId ?? null,
        teamEntryId: teamEntryId ?? null,
      }
    );

    const terminalFilter = fromStatus
      ? { status: fromStatus }
      : { status: { in: [...TERMINAL_DAY_OPS_STATUSES] } };

    const { row, officialSyncSkipped, revertedFrom } = await prisma.$transaction(async (tx) => {
      const existing = await tx.competitionParticipantStatus.findFirst({
        where: {
          competitionId,
          eventId,
          participantType,
          competitionEntryId: competitionEntryId ?? null,
          teamEntryId: teamEntryId ?? null,
          marshalRound,
          ...terminalFilter,
        },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new Error("NOT_TERMINAL");
      }

      const updated = await tx.competitionParticipantStatus.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          reason: note,
          calledAt: targetStatus === "CALLED" ? now : null,
          updatedByUserId: operatorUserId,
        },
      });

      if (targetStatus !== "PENDING") {
        await markMarshalStartedIfUnset(tx.event, eventId, now);
      }

      const sync = await clearOfficialRowAfterTerminalRevert(tx, {
        competitionId,
        eventId,
        round: marshalRound,
        participant: {
          participantType,
          competitionEntryId: competitionEntryId ?? null,
          teamEntryId: teamEntryId ?? null,
        },
        heatIndex: heatIndexForRevert,
        terminalStatus: existing.status as TerminalDayOpsStatus,
      });

      return {
        row: updated,
        officialSyncSkipped: sync.officialSyncSkipped,
        revertedFrom: existing.status,
      };
    });

    await logAuditAction({
      action: "COMPETITION_PARTICIPANT_TERMINAL_REVERT",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "CompetitionParticipantStatus",
      targetId: row.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        participantType,
        competitionEntryId: competitionEntryId ?? null,
        teamEntryId: teamEntryId ?? null,
        targetStatus,
        marshalRound,
        revertedFrom,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      id: row.id,
      status: row.status,
      revertedFrom,
      officialSyncSkipped,
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
    if (error instanceof Error && error.message === "NOT_TERMINAL") {
      return NextResponse.json(
        { error: "終了ステータス（DNS・棄権・DNF・DSQ）の参加者のみ取り消せます" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/participant-terminal-revert/route.ts",
      error
    );
  }
}
