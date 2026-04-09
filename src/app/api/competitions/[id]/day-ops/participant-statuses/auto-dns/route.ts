import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { verifySession } from "@/lib/auth";
import { assertDayOpsAdminWriteAccess } from "@/lib/dayOpsAccess";
import { prisma } from "@/server/db";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { loadStartListSnapshotPayload, resolveParticipantMarshalHeat } from "@/lib/heatMarshalGate";
import {
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import { expandTeamMarshalRefsWithMembers } from "@/lib/teamMarshalExpand";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = { params: Promise<{ id: string }> };

const autoDsqSchema = z.object({
  eventId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
  calledOnly: z.boolean().optional(),
  /** true のとき未召集（PENDING）のみ。calledOnly より優先 */
  pendingOnly: z.boolean().optional(),
  round: z.enum(["HEAT", "SEMI", "FINAL"]).optional(),
  heatIndex: z.number().int().min(1).optional(),
});

type AutoDsqMode = "pendingOnly" | "calledOnly" | "pendingOrCalled";

function marshalRefKey(ref: MarshalParticipantRef): string {
  return ref.participantType === "INDIVIDUAL" && ref.competitionEntryId
    ? `I:${ref.competitionEntryId}`
    : ref.participantType === "TEAM" && ref.teamEntryId
      ? `T:${ref.teamEntryId}`
      : "";
}

/** 既存 DB 行の status（無い場合は未マーシャル＝未召集扱い）が、このモードで DSQ 対象か */
function shouldApplyAutoDsq(existingStatus: string | undefined | null, mode: AutoDsqMode): boolean {
  const st = existingStatus;
  if (st === "DNS" || st === "WITHDRAWN" || st === "DSQ") return false;
  if (mode === "pendingOnly") {
    if (st === "CALLED") return false;
    return true;
  }
  if (mode === "calledOnly") {
    return st === "CALLED";
  }
  return st === "PENDING" || st === "CALLED" || st == null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id: competitionId } = await context.params;
    await assertDayOpsAdminWriteAccess(competitionId, session.userId);

    const parsed = autoDsqSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const {
      eventId,
      reason,
      calledOnly,
      pendingOnly,
      round: roundParam,
      heatIndex: heatIndexFilter,
    } = parsed.data;
    const round: ResultRound = roundParam ?? "HEAT";
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        competitionId,
      },
      select: { id: true, startListHeatPlanConfirmedAt: true },
    });
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

    const mode: AutoDsqMode = pendingOnly
      ? "pendingOnly"
      : calledOnly
        ? "calledOnly"
        : "pendingOrCalled";

    const now = new Date();
    const defaultReasonPendingOnly = "マーシャル未完了により欠場（未出場）扱い";
    const defaultReasonDsq = "招集漏れのため失格（DSQ）扱い";
    const terminalStatus = mode === "pendingOnly" ? ("DNS" as const) : ("DSQ" as const);
    const updateReason =
      reason?.trim() ||
      (mode === "pendingOnly" ? defaultReasonPendingOnly : defaultReasonDsq);

    const snapshot = await loadStartListSnapshotPayload(competitionId);
    const roundData = getRoundDataFromSnapshot(snapshot, eventId, round);
    const refsFromSnapshot = await expandTeamMarshalRefsWithMembers(
      prisma,
      marshalParticipantRefsForAutoDsq(roundData, heatIndexFilter ?? null)
    );

    let updatedCount = 0;

    if (refsFromSnapshot.length > 0) {
      const orConditions: Array<
        | {
            participantType: "INDIVIDUAL";
            competitionEntryId: string;
            teamEntryId: null;
            teamMemberUserId: null;
          }
        | {
            participantType: "TEAM";
            competitionEntryId: null;
            teamEntryId: string;
            teamMemberUserId: string | null;
          }
      > = [];
      for (const ref of refsFromSnapshot) {
        if (ref.participantType === "INDIVIDUAL" && ref.competitionEntryId) {
          orConditions.push({
            participantType: "INDIVIDUAL",
            competitionEntryId: ref.competitionEntryId,
            teamEntryId: null,
            teamMemberUserId: null,
          });
        } else if (ref.participantType === "TEAM" && ref.teamEntryId) {
          orConditions.push({
            participantType: "TEAM",
            competitionEntryId: null,
            teamEntryId: ref.teamEntryId,
            teamMemberUserId: ref.teamMemberUserId ?? null,
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        const existingRows =
          orConditions.length > 0
            ? await tx.competitionParticipantStatus.findMany({
                where: {
                  competitionId,
                  eventId,
                  marshalRound: round,
                  OR: orConditions,
                },
                select: {
                  id: true,
                  participantType: true,
                  competitionEntryId: true,
                  teamEntryId: true,
                  teamMemberUserId: true,
                  status: true,
                },
              })
            : [];

        const byKey = new Map<string, (typeof existingRows)[0]>();
        for (const row of existingRows) {
          const k =
            row.participantType === "INDIVIDUAL" && row.competitionEntryId
              ? `I:${row.competitionEntryId}`
              : row.participantType === "TEAM" && row.teamEntryId
                ? row.teamMemberUserId != null
                  ? `T:${row.teamEntryId}:${row.teamMemberUserId}`
                  : `T:${row.teamEntryId}`
                : "";
          if (k) byKey.set(k, row);
        }

        for (const ref of refsFromSnapshot) {
          const k = marshalRefKey(ref);
          if (!k) continue;
          const row = byKey.get(k);
          const st = row?.status;
          if (!shouldApplyAutoDsq(st, mode)) continue;

          if (row) {
            await tx.competitionParticipantStatus.update({
              where: { id: row.id },
              data: {
                status: terminalStatus,
                reason: updateReason,
                updatedByUserId: session.userId,
                updatedAt: now,
              },
            });
          } else {
            await tx.competitionParticipantStatus.create({
              data: {
                competitionId,
                eventId,
                participantType: ref.participantType,
                competitionEntryId: ref.competitionEntryId,
                teamEntryId: ref.teamEntryId,
                teamMemberUserId: ref.teamMemberUserId ?? null,
                marshalRound: round,
                status: terminalStatus,
                reason: updateReason,
                calledAt: null,
                updatedByUserId: session.userId,
              },
            });
          }
          updatedCount += 1;
        }

        await markMarshalStartedIfUnset(tx.event, eventId, now);
      });
    } else {
      /** スナップショットに該当ヒート／ラウンドが無いときのフォールバック（従来: DB 上の行のみ） */
      const statusFilter = pendingOnly
        ? (["PENDING"] as const)
        : calledOnly
          ? (["CALLED"] as const)
          : (["PENDING", "CALLED"] as const);

      let currentStatuses = await prisma.competitionParticipantStatus.findMany({
        where: {
          competitionId,
          eventId,
          marshalRound: round,
          status: {
            in: [...statusFilter],
          },
        },
        select: {
          id: true,
          participantType: true,
          competitionEntryId: true,
          teamEntryId: true,
        },
      });

      if (heatIndexFilter != null) {
        currentStatuses = currentStatuses.filter((s) => {
          const hi = resolveParticipantMarshalHeat(snapshot, eventId, round, {
            participantType: s.participantType,
            competitionEntryId: s.competitionEntryId,
            teamEntryId: s.teamEntryId,
          });
          return hi === heatIndexFilter;
        });
      }

      if (currentStatuses.length === 0) {
        return NextResponse.json({ updatedCount: 0 });
      }

      await prisma.$transaction(async (tx) => {
        await Promise.all(
          currentStatuses.map((status) =>
            tx.competitionParticipantStatus.update({
              where: { id: status.id },
              data: {
                status: terminalStatus,
                reason: updateReason,
                updatedByUserId: session.userId,
                updatedAt: now,
              },
            })
          )
        );
        await markMarshalStartedIfUnset(tx.event, eventId, now);
      });
      updatedCount = currentStatuses.length;
    }

    await logAuditAction({
      action: "COMPETITION_PARTICIPANT_STATUS_AUTO_DSQ",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "Competition",
      targetId: competitionId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        calledOnly: Boolean(calledOnly),
        pendingOnly: Boolean(pendingOnly),
        round,
        heatIndex: heatIndexFilter ?? null,
        updatedCount,
        reason: updateReason,
        source: refsFromSnapshot.length > 0 ? "snapshot" : "db_fallback",
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ updatedCount });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/day-ops/participant-statuses/auto-dns/route.ts", error);
  }
}
