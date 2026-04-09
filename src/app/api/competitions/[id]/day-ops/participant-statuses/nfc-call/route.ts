import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { assertDayOpsAdminWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import {
  getClosedMarshalHeatIndices,
  isMarshalHeatCallClosed,
  loadStartListSnapshotPayload,
  resolveParticipantMarshalHeat,
} from "@/lib/heatMarshalGate";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const payloadSchema = z.object({
  eventId: z.string().min(1),
  nfcTagId: z.string().trim().min(1).max(128),
  status: z.enum(["CALLED"]).optional(),
  reason: z.string().trim().max(200).optional(),
  marshalRound: z.enum(["HEAT", "SEMI", "FINAL"]).optional(),
});

function normalizeTag(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-:]/g, "");
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

    const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, status } = parsed.data;
    const marshalRound: ResultRound = parsed.data.marshalRound ?? "HEAT";
    const nfcTagId = normalizeTag(parsed.data.nfcTagId);
    const nextStatus = status ?? "CALLED";
    const reason = parsed.data.reason?.trim() || "NFC召集処理";
    const [event, user] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: { id: true, type: true, name: true, startListHeatPlanConfirmedAt: true },
      }),
      prisma.user.findFirst({
        where: { nfcTagId },
        select: { id: true, familyName: true, givenName: true },
      }),
    ]);
    if (!event) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!event.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        {
          error:
            "先にスタートリストでステップ1（ラウンド別ヒート数）を確定してください。確定後にマーシャル操作が可能になります。",
        },
        { status: 409 }
      );
    }
    if (!user) {
      return NextResponse.json({ error: "NFCタグに紐付くユーザーがいません" }, { status: 404 });
    }

    const [individualEntries, teamEntries] = await Promise.all([
      prisma.competitionEntry.findMany({
        where: {
          competitionId,
          userId: user.id,
          status: "SUBMITTED",
          items: { some: { eventId } },
        },
        select: { id: true },
      }),
      prisma.teamEntry.findMany({
        where: {
          competitionId,
          eventId,
          members: { some: { userId: user.id } },
        },
        select: { id: true, teamName: true },
      }),
    ]);

    if (individualEntries.length === 0 && teamEntries.length === 0) {
      return NextResponse.json(
        { error: "対象ユーザーはこの種目の参加者ではありません" },
        { status: 400 }
      );
    }

    if (nextStatus === "CALLED") {
      const [snapshot, closedHeats] = await Promise.all([
        loadStartListSnapshotPayload(competitionId),
        getClosedMarshalHeatIndices(prisma, competitionId, eventId, marshalRound),
      ]);
      for (const entry of individualEntries) {
        const heatIndex = resolveParticipantMarshalHeat(snapshot, eventId, marshalRound, {
          participantType: "INDIVIDUAL",
          competitionEntryId: entry.id,
          teamEntryId: null,
        });
        if (isMarshalHeatCallClosed(closedHeats, heatIndex)) {
          return NextResponse.json(
            {
              error: `このラウンドのヒート${heatIndex}は召集締切済みのためNFC召集できません`,
            },
            { status: 409 }
          );
        }
      }
      for (const team of teamEntries) {
        const heatIndex = resolveParticipantMarshalHeat(snapshot, eventId, marshalRound, {
          participantType: "TEAM",
          competitionEntryId: null,
          teamEntryId: team.id,
        });
        if (isMarshalHeatCallClosed(closedHeats, heatIndex)) {
          return NextResponse.json(
            {
              error: `このラウンドのヒート${heatIndex}は召集締切済みのためNFC召集できません`,
            },
            { status: 409 }
          );
        }
      }
    }

    const now = new Date();
    const updatedIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const entry of individualEntries) {
        const existing = await tx.competitionParticipantStatus.findFirst({
          where: {
            competitionId,
            eventId,
            participantType: "INDIVIDUAL",
            competitionEntryId: entry.id,
            teamEntryId: null,
            marshalRound,
          },
          select: { id: true, status: true },
        });
        let statusRow: { id: string };
        if (existing) {
          if (existing.status === "DNS" || existing.status === "WITHDRAWN" || existing.status === "DSQ") {
            throw new Error("PARTICIPANT_STATUS_TERMINAL");
          }
          statusRow = await tx.competitionParticipantStatus.update({
            where: { id: existing.id },
            data: {
              status: nextStatus,
              reason,
              calledAt: nextStatus === "CALLED" ? now : null,
              updatedByUserId: session.userId,
            },
            select: { id: true },
          });
        } else {
          statusRow = await tx.competitionParticipantStatus.create({
            data: {
              competitionId,
              eventId,
              participantType: "INDIVIDUAL",
              competitionEntryId: entry.id,
              marshalRound,
              status: nextStatus,
              reason,
              calledAt: nextStatus === "CALLED" ? now : null,
              updatedByUserId: session.userId,
            },
            select: { id: true },
          });
        }
        updatedIds.push(statusRow.id);
      }

      for (const team of teamEntries) {
        const existing = await tx.competitionParticipantStatus.findFirst({
          where: {
            competitionId,
            eventId,
            participantType: "TEAM",
            competitionEntryId: null,
            teamEntryId: team.id,
            marshalRound,
          },
          select: { id: true, status: true },
        });
        let statusRow: { id: string };
        if (existing) {
          if (existing.status === "DNS" || existing.status === "WITHDRAWN" || existing.status === "DSQ") {
            throw new Error("PARTICIPANT_STATUS_TERMINAL");
          }
          statusRow = await tx.competitionParticipantStatus.update({
            where: { id: existing.id },
            data: {
              status: nextStatus,
              reason,
              calledAt: nextStatus === "CALLED" ? now : null,
              updatedByUserId: session.userId,
            },
            select: { id: true },
          });
        } else {
          statusRow = await tx.competitionParticipantStatus.create({
            data: {
              competitionId,
              eventId,
              participantType: "TEAM",
              teamEntryId: team.id,
              marshalRound,
              status: nextStatus,
              reason,
              calledAt: nextStatus === "CALLED" ? now : null,
              updatedByUserId: session.userId,
            },
            select: { id: true },
          });
        }
        updatedIds.push(statusRow.id);
      }

      await markMarshalStartedIfUnset(tx.event, eventId, now);
    });

    await logAuditAction({
      action: "COMPETITION_PARTICIPANT_STATUS_NFC_CALL",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "Competition",
      targetId: competitionId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        marshalRound,
        nfcTagId,
        targetUserId: user.id,
        status: nextStatus,
        updatedCount: updatedIds.length,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      eventId,
      status: nextStatus,
      targetUserId: user.id,
      targetUserName: `${user.familyName} ${user.givenName}`,
      updatedCount: updatedIds.length,
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
        { error: "DNS/棄権/失格になった参加者はNFC召集で更新できません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/participant-statuses/nfc-call/route.ts",
      error
    );
  }
}
