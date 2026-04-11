import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  assertDayOpsAdminWriteAccess,
  assertDayOpsRecorderWriteAccess,
} from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  getRoundDataFromSnapshot,
  isEventPresentInSnapshot,
  listMarshalRoundsInSnapshotForEvent,
} from "@/lib/heatMarshalFromSnapshot";
import {
  loadStartListSnapshotPayload,
  loadStartListSnapshotPayloadLoose,
} from "@/lib/heatMarshalGate";
import { buildParticipantMarshalDisplayByKeyForRound } from "@/lib/competitionParticipantStatusScope";
import { effectiveDayOpsStatusForMarshalDisplay } from "@/lib/dayOpsParticipantStatusDisplay";
import { buildMarshalRoundLabelBySnapshotKey, getLiveTabsAligned } from "@/lib/startListEventTabDisplay";
import { parseStartListSettings } from "@/lib/startListSettings";
import { repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist } from "@/lib/startListSnapshot";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import {
  heatIndicesBlockingMarshalReopen,
  marshalReopenBlockedForHeat,
} from "@/lib/marshalHeatOfficialResultGate";

type RouteContext = { params: Promise<{ id: string }> };

const RESULT_ROUNDS = ["HEAT", "SEMI", "FINAL"] as const satisfies readonly ResultRound[];

function parseRoundParam(raw: string | null, fallback: ResultRound): ResultRound | null {
  if (!raw) return fallback;
  return (RESULT_ROUNDS as readonly string[]).includes(raw) ? (raw as ResultRound) : null;
}

const putSchema = z.object({
  eventId: z.string().min(1),
  round: z.enum(RESULT_ROUNDS),
  heatIndex: z.number().int().min(1),
  isClosed: z.boolean(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const getCtx = await assertDayOpsRecorderWriteAccess(competitionId, request);
    const operatorUserId = getCtx.operatorUserId;

    try {
      await repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist({
        competitionId,
        createdByUserId: operatorUserId ?? undefined,
      });
    } catch (e) {
      console.error("repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist:", e);
    }

    const sp = new URL(request.url).searchParams;
    const eventId = sp.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventIdが必要です" }, { status: 400 });
    }
    const round = parseRoundParam(sp.get("round"), "HEAT");
    if (!round) {
      return NextResponse.json({ error: "roundが不正です" }, { status: 400 });
    }

    const [eventRow, snapshot, statuses, competition] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: { id: true, startListHeatPlanConfirmedAt: true, startListRoundCount: true },
      }),
      loadStartListSnapshotPayload(competitionId).then(
        async (s) => s ?? (await loadStartListSnapshotPayloadLoose(competitionId))
      ),
      prisma.competitionParticipantStatus.findMany({
        where: { competitionId, eventId },
        orderBy: { updatedAt: "desc" },
        select: {
          participantType: true,
          competitionEntryId: true,
          teamEntryId: true,
          teamMemberUserId: true,
          status: true,
          calledAt: true,
          marshalRound: true,
          updatedAt: true,
        },
      }),
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { startListSettings: true },
      }),
    ]);

    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    const { eventSettings } = parseStartListSettings(competition?.startListSettings);
    const heatSetting = eventSettings[eventId] ?? {};
    const liveTabs = getLiveTabsAligned(heatSetting, eventRow.startListRoundCount);
    const tabCount = Math.max(1, liveTabs.length);
    const roundLabels = buildMarshalRoundLabelBySnapshotKey(liveTabs, tabCount);

    const availableRounds = listMarshalRoundsInSnapshotForEvent(snapshot, eventId);
    let effectiveRound = round;
    let roundWasAdjusted = false;
    if (availableRounds.length > 0 && !availableRounds.includes(round)) {
      effectiveRound = availableRounds[0];
      roundWasAdjusted = true;
    }

    const marshalRows = await prisma.competitionHeatMarshalState.findMany({
      where: { competitionId, eventId, round: effectiveRound },
      select: { heatIndex: true, callClosedAt: true },
    });

    const closedByHeat = new Map<number, Date | null>();
    for (const r of marshalRows) {
      closedByHeat.set(r.heatIndex, r.callClosedAt);
    }

    const statusByKey = buildParticipantMarshalDisplayByKeyForRound(statuses, effectiveRound);

    const roundData = getRoundDataFromSnapshot(snapshot, eventId, effectiveRound);
    const snapshotDocumentExists = Boolean(snapshot);
    const eventInSnapshot = isEventPresentInSnapshot(snapshot, eventId);

    const heatsOrdered = [...(roundData?.heats ?? [])].sort((a, b) => a.heatIndex - b.heatIndex);

    const teamIdsInRound = new Set<string>();
    for (const h of heatsOrdered) {
      for (const p of h.participants ?? []) {
        if (p.kind === "TEAM" && "teamEntryId" in p && typeof p.teamEntryId === "string") {
          teamIdsInRound.add(p.teamEntryId);
        }
      }
    }
    const teamMembersByTeamId = new Map<string, Array<{ userId: string; label: string }>>();
    if (teamIdsInRound.size > 0) {
      const memberRows = await prisma.teamEntryMember.findMany({
        where: { teamEntryId: { in: [...teamIdsInRound] } },
        orderBy: { order: "asc" },
        select: {
          teamEntryId: true,
          userId: true,
          user: { select: { familyName: true, givenName: true } },
        },
      });
      for (const m of memberRows) {
        const list = teamMembersByTeamId.get(m.teamEntryId) ?? [];
        list.push({
          userId: m.userId,
          label: `${m.user.familyName} ${m.user.givenName}`,
        });
        teamMembersByTeamId.set(m.teamEntryId, list);
      }
    }

    const heatIndicesForBlock = heatsOrdered.map((h) => h.heatIndex);
    const marshalReopenBlockedHeats =
      heatIndicesForBlock.length > 0
        ? await heatIndicesBlockingMarshalReopen(prisma, {
            competitionId,
            eventId,
            round: effectiveRound,
            heatIndices: heatIndicesForBlock,
          })
        : new Set<number>();

    const heats =
      heatsOrdered.map((h) => {
        const heatMarshalCallClosed = Boolean(closedByHeat.get(h.heatIndex));
        return {
          heatIndex: h.heatIndex,
          callClosedAt: closedByHeat.get(h.heatIndex)?.toISOString() ?? null,
          /** 公式リザルトが付いたヒートはマーシャル締切を解除できない */
          marshalReopenBlocked: marshalReopenBlockedHeats.has(h.heatIndex),
          participants: (() => {
            const heatParticipants = h.participants ?? [];
            const rows: Array<{
              lane: number;
              participantType: "INDIVIDUAL" | "TEAM";
              competitionEntryId: string | null;
              teamEntryId: string | null;
              teamMemberUserId?: string | null;
              label: string;
              clubName: string | null;
              status: string;
              calledAt: string | null;
            }> = [];
            let lane = 0;
            for (const p of heatParticipants) {
              if (p.kind === "INDIVIDUAL") {
                lane += 1;
                const st = statusByKey.get(`I:${p.entryId}`);
                const stored = st?.status ?? "PENDING";
                rows.push({
                  lane,
                  participantType: "INDIVIDUAL" as const,
                  competitionEntryId: p.entryId,
                  teamEntryId: null,
                  label: p.name,
                  clubName: p.clubName,
                  status: effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed),
                  calledAt: st?.calledAt?.toISOString() ?? null,
                });
                continue;
              }
              if (p.kind === "TEAM" && p.teamEntryId) {
                lane += 1;
                const members = teamMembersByTeamId.get(p.teamEntryId) ?? [];
                if (members.length === 0) {
                  const stUnassigned = statusByKey.get(`T:${p.teamEntryId}`);
                  const stored = stUnassigned?.status ?? "PENDING";
                  rows.push({
                    lane,
                    participantType: "TEAM" as const,
                    competitionEntryId: null,
                    teamEntryId: p.teamEntryId,
                    teamMemberUserId: null,
                    label: `${p.teamName}（メンバー未割当）`,
                    clubName: p.clubName,
                    status: effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed),
                    calledAt: stUnassigned?.calledAt?.toISOString() ?? null,
                  });
                } else {
                  for (const mem of members) {
                    const st = statusByKey.get(`T:${p.teamEntryId}:${mem.userId}`);
                    const stored = st?.status ?? "PENDING";
                    rows.push({
                      lane,
                      participantType: "TEAM" as const,
                      competitionEntryId: null,
                      teamEntryId: p.teamEntryId,
                      teamMemberUserId: mem.userId,
                      label: `${p.teamName}（${mem.label}）`,
                      clubName: p.clubName,
                      status: effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed),
                      calledAt: st?.calledAt?.toISOString() ?? null,
                    });
                  }
                }
              }
            }
            return rows;
          })(),
        };
      }) ?? [];

    return NextResponse.json({
      eventId,
      /** 実際に一覧・締切状態を解決したラウンド */
      round: effectiveRound,
      /** クエリで指定されたラウンド（effective と異なるときは roundWasAdjusted が true） */
      requestedRound: round,
      roundWasAdjusted,
      /** スナップショットに存在するラウンドのみ（進行順）。空は未スナップショット等 */
      availableRounds,
      /**
       * 種目スタートリストのタブ名（表示用）。キーはスナップショット内部識別子 HEAT/SEMI/FINAL。
       * 競技上の「予選」等とは必ずしも一致しない。
       */
      roundLabels,
      heatPlanConfirmed: Boolean(eventRow.startListHeatPlanConfirmedAt),
      hasSnapshotRound: Boolean(roundData),
      /** 大会にスナップショット行（JSON）があるか */
      snapshotDocumentExists,
      /** 当該種目がスナップショット events に含まれるか（ヒートの有無とは別） */
      eventInSnapshot,
      heats,
    });
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
      "GET api/competitions/[id]/day-ops/heat-marshal/route.ts",
      error
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const putCtx = await assertDayOpsAdminWriteAccess(competitionId, request);
    const putOperatorUserId = putCtx.operatorUserId;

    const parsed = putSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const { eventId, round, heatIndex, isClosed } = parsed.data;

    if (!isClosed) {
      const blocked = await marshalReopenBlockedForHeat(prisma, {
        competitionId,
        eventId,
        round,
        heatIndex,
      });
      if (blocked) {
        return NextResponse.json(
          {
            error:
              "このヒートには公式リザルト（順位の記録またはヒート確定）があるため、マーシャル締切を受付中に戻せません",
          },
          { status: 409 }
        );
      }
    }

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

    const snapshot = await loadStartListSnapshotPayload(competitionId);
    const roundData = getRoundDataFromSnapshot(snapshot, eventId, round);
    const heatExists = roundData?.heats.some((h) => h.heatIndex === heatIndex) ?? false;
    if (isClosed && !heatExists) {
      return NextResponse.json(
        { error: "スタートリストに該当ヒートがありません。スナップショットを確認してください。" },
        { status: 400 }
      );
    }

    const now = new Date();
    await prisma.competitionHeatMarshalState.upsert({
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
        callClosedAt: isClosed ? now : null,
      },
      update: {
        callClosedAt: isClosed ? now : null,
      },
    });

    await logAuditAction({
      action: isClosed ? "COMPETITION_HEAT_CALL_WINDOW_CLOSE" : "COMPETITION_HEAT_CALL_WINDOW_REOPEN",
      actorType: putOperatorUserId ? "USER" : "SYSTEM",
      actorKey: putOperatorUserId ? `user:${putOperatorUserId}` : "dayops:unlock",
      actorUserId: putOperatorUserId ?? undefined,
      targetType: "Competition",
      targetId: competitionId,
      targetKey: `competition:${competitionId}`,
      metadata: { competitionId, eventId, round, heatIndex, isClosed },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ ok: true, eventId, round, heatIndex, isClosed });
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
      "PUT api/competitions/[id]/day-ops/heat-marshal/route.ts",
      error
    );
  }
}
