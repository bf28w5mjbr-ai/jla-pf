import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import type { MarshalParticipantRef } from "@/lib/heatMarshalFromSnapshot";
import {
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
} from "@/lib/heatMarshalFromSnapshot";
import { expandTeamMarshalRefsWithMembers } from "@/lib/teamMarshalExpand";
import { tryAutoAppendNextStartListRound } from "@/lib/startListNextRoundFromOfficial";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

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
        { error: "先にスタートリストのステップ1を確定してください。" },
        { status: 409 }
      );
    }

    const snapshot = await loadStartListSnapshotPayload(competitionId);
    const roundData = getRoundDataFromSnapshot(snapshot, eventId, roundDb);
    const refsInHeat = marshalParticipantRefsForAutoDsq(roundData, heatIndex);
    const expandedRefs = await expandTeamMarshalRefsWithMembers(prisma, refsInHeat);
    const teamMemberRefsByTeam = new Map<string, MarshalParticipantRef[]>();
    for (const r of expandedRefs) {
      if (r.participantType === "TEAM" && r.teamEntryId) {
        const list = teamMemberRefsByTeam.get(r.teamEntryId) ?? [];
        list.push(r);
        teamMemberRefsByTeam.set(r.teamEntryId, list);
      }
    }

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

      if (refsInHeat.length > 0) {
        let calledInHeat = 0;
        for (const ref of refsInHeat) {
          if (ref.participantType === "INDIVIDUAL" && ref.competitionEntryId) {
            const stRow = await tx.competitionParticipantStatus.findFirst({
              where: {
                competitionId,
                eventId,
                participantType: "INDIVIDUAL",
                competitionEntryId: ref.competitionEntryId,
                teamEntryId: null,
                teamMemberUserId: null,
                marshalRound: roundDb,
              },
              select: { status: true },
            });
            if (stRow?.status === "CALLED") calledInHeat += 1;
            continue;
          }
          if (ref.participantType === "TEAM" && ref.teamEntryId) {
            const memberRefs = teamMemberRefsByTeam.get(ref.teamEntryId) ?? [];
            if (memberRefs.length === 0) continue;
            const allCalled = (
              await Promise.all(
                memberRefs.map((mr: MarshalParticipantRef) =>
                  tx.competitionParticipantStatus.findFirst({
                    where: {
                      competitionId,
                      eventId,
                      participantType: "TEAM",
                      competitionEntryId: null,
                      teamEntryId: ref.teamEntryId,
                      teamMemberUserId: mr.teamMemberUserId ?? null,
                      marshalRound: roundDb,
                    },
                    select: { status: true },
                  })
                )
              )
            ).every((stRow: { status: string } | null) => stRow?.status === "CALLED");
            if (allCalled) calledInHeat += 1;
          }
        }
        const rankCount = await tx.officialResultRow.count({
          where: {
            officialResultId: officialResult.id,
            heat: heatIndex,
            status: "OK",
          },
        });
        if (calledInHeat > 0 && rankCount < calledInHeat) {
          throw new Error("HEAT_RESULT_INCOMPLETE_RANKS");
        }
      }

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
      try {
        const append = await tryAutoAppendNextStartListRound({
          competitionId,
          eventId,
          finishedRound: round,
        });
        if (!append.ok) {
          console.warn("start-list auto-append after heat confirm:", append.error);
        }
      } catch (e) {
        console.error("start-list auto-append after heat confirm failed:", e);
      }
    }

    return NextResponse.json({ ok: true, heatIndex });
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
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/heat-result-capture/confirm-heat/route.ts",
      error
    );
  }
}
