import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import {
  parseStartListSettings,
  resolveHeatCountForSnapshotTransition,
  resolveMaxLanesForSnapshotTransition,
} from "@/lib/startListSettings";
import {
  buildNextRoundHeatsFromPreviousResults,
  collectAdvancersPerHeatByRank,
  collectUniformTopPerHeat,
  computeAdvanceCountsByLaneSlotsPerHeat,
  countStartListParticipantsBySourceHeat,
  enforceMinHeatCountForMaxLanes,
  mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas,
  reorderRounds,
  resolveHeatCount,
  totalAdvanceCapacityFromNextRoundLayout,
  type StartListParticipant,
  type StartListRound,
  type StartListRoundData,
} from "@/lib/startListRounds";
import { parseStartListSnapshotLooseForRoundRead } from "@/lib/heatMarshalFromSnapshot";
import {
  dedupeOfficialResultRowsForAdvance,
  filterHeatOfficialRowsForNextRoundAdvance,
  groupOfficialRowsByResolvedHeatAndSnapshotOrder,
  resolveOfficialRowHeatBucketKey,
} from "@/lib/startListAdvanceEligibility";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import { createStartListSnapshotIfNeeded } from "@/lib/startListSnapshot";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z.object({
  eventId: z.string().min(1),
  fromRound: z.enum(["HEAT", "SEMI"]),
  toRound: z.enum(["SEMI", "FINAL"]),
  /** 指定時は各ヒート上位 n 名の従来モード。未指定時は最大レーン×次ヒート数で各ヒートから按分アップ */
  topPerHeat: z.number().int().min(1).max(200).optional(),
  maxAdvancers: z.number().int().min(1).max(200).optional(),
  mode: z.enum(["count", "size"]).optional(),
  /** 生成する次ラウンドのヒート数（未指定時は種目の progressionHeatCounts またはデフォルト） */
  heatCount: z.number().int().min(1).max(64).optional(),
  heatSize: z.number().int().min(1).max(64).optional(),
});

type SnapshotEvent = {
  eventId: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  rounds?: StartListRoundData[];
};

type SnapshotData = {
  version?: number;
  capturedAt?: string;
  events?: SnapshotEvent[];
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;

    const { id: competitionId } = await context.params;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);
    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }

    const payload = parsed.data;
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        organizationId: true,
        startListSettings: true,
        organization: {
          select: {
            status: true,
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
              select: { role: true },
            },
          },
        },
        events: {
          where: { id: payload.eventId },
          select: {
            id: true,
            name: true,
            sex: true,
            type: true,
            preliminaryHeatLaneCount: true,
          },
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (
      !canManageCompetitionStartListSettings({ orgAdminsForCurrentUser: competition.organization.admins, orgStatus: competition.organization.status, hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const event = competition.events[0];
    if (!event) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }

    if (payload.fromRound === "SEMI" && payload.toRound !== "FINAL") {
      return NextResponse.json(
        { error: "SEMIからはFINALのみ生成できます" },
        { status: 400 }
      );
    }

    await createStartListSnapshotIfNeeded({
      competitionId,
      createdByUserId: sessionUserId ?? undefined,
      skipPaymentStabilityCheck: true,
      skipEntryDeadlineGate: true,
    });
    const snapshot = await prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId },
      select: { id: true, data: true },
    });
    if (!snapshot) {
      return NextResponse.json({ error: "スタートリスト固定データがありません" }, { status: 404 });
    }

    const official = await prisma.officialResult.findUnique({
      where: {
        competitionId_eventId_round: {
          competitionId,
          eventId: payload.eventId,
          round: payload.fromRound,
        },
      },
      include: {
        rows: {
          where: { status: "OK" },
          include: {
            competitionEntry: {
              include: {
                user: {
                  select: { id: true, profile: { select: { familyName: true, givenName: true } } },
                },
                club: {
                  select: { id: true, name: true },
                },
              },
            },
            teamEntry: {
              include: {
                club: { select: { id: true, name: true } },
                members: {
                  include: {
                    user: {
                      select: { profile: { select: { familyName: true, givenName: true } } },
                    },
                  },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          orderBy: [{ heat: "asc" }, { rank: "asc" }],
        },
      },
    });
    if (!official || official.rows.length === 0) {
      return NextResponse.json(
        { error: `前ラウンド(${payload.fromRound})の公式結果がありません` },
        { status: 400 }
      );
    }

    const snapshotPayload = parseStartListSnapshotLooseForRoundRead(snapshot.data);
    const rowsForAdvance = dedupeOfficialResultRowsForAdvance(official.rows);
    const heatEntriesRaw = groupOfficialRowsByResolvedHeatAndSnapshotOrder(
      rowsForAdvance,
      snapshotPayload,
      payload.eventId,
      payload.fromRound
    );
    const heatEntries = await filterHeatOfficialRowsForNextRoundAdvance(
      {
        competitionId,
        eventId: payload.eventId,
        fromRound: payload.fromRound,
      },
      heatEntriesRaw
    );
    const sourceHeatSizes = heatEntries.map(([, rows]) => rows.length);
    const totalInRound = sourceHeatSizes.reduce((a, b) => a + b, 0);

    const eventSettings = parseStartListSettings(competition.startListSettings).eventSettings;
    const eventSetting = eventSettings[payload.eventId];
    const fallbackNextHeats = payload.toRound === "FINAL" ? 1 : 2;
    /** 按分定員 min(ヒート数×最大レーン, 前ラ全員) 用。roundTabs＋人数から都度計算 */
    const nextHeatCountForCapacity = resolveHeatCountForSnapshotTransition({
      setting: eventSetting,
      participantTotal: totalInRound,
      fromRound: payload.fromRound,
      toRound: payload.toRound,
      requestedHeatCount: typeof payload.heatCount === "number" ? payload.heatCount : undefined,
    });

    const maxLanes = resolveMaxLanesForSnapshotTransition({
      setting: eventSetting,
      eventDefaultLanes: event.preliminaryHeatLaneCount,
      fromRound: payload.fromRound,
      toRound: payload.toRound,
    });
    const useUniformTop = typeof payload.topPerHeat === "number";

    let advancePerHeat: number[] | null = null;
    let selectedRows: typeof official.rows;

    if (useUniformTop) {
      selectedRows = collectUniformTopPerHeat(heatEntries, payload.topPerHeat!);
    } else {
      if (typeof maxLanes !== "number" || !Number.isFinite(maxLanes) || maxLanes < 1) {
        return NextResponse.json(
          {
            error:
              "按分アップには最大レーン数が必要です。種目の共通設定か、スタートリストのラウンド設定で遷移先ラウンドの最大レーンを指定するか、従来どおり topPerHeat を指定してください。",
          },
          { status: 400 }
        );
      }
      const capacity = totalAdvanceCapacityFromNextRoundLayout(
        nextHeatCountForCapacity,
        maxLanes,
        totalInRound
      );
      advancePerHeat = computeAdvanceCountsByLaneSlotsPerHeat(heatEntries.length, maxLanes, capacity);
      selectedRows = collectAdvancersPerHeatByRank(heatEntries, advancePerHeat);
    }

    const cappedRows =
      typeof payload.maxAdvancers === "number"
        ? selectedRows.slice(0, payload.maxAdvancers)
        : selectedRows;

    const participants: StartListParticipant[] = [];
    for (const row of cappedRows) {
      const sourceHeat =
        resolveOfficialRowHeatBucketKey(row, snapshotPayload, payload.eventId, payload.fromRound) ??
        row.heat ??
        undefined;
      if (row.entryType === "INDIVIDUAL" && row.competitionEntry) {
        participants.push({
          kind: "INDIVIDUAL",
          entryId: row.competitionEntry.id,
          userId: row.competitionEntry.userId,
          name: `${row.competitionEntry.user.profile?.familyName ?? ""} ${row.competitionEntry.user.profile?.givenName ?? ""}`.trim(),
          clubId: row.competitionEntry.club?.id ?? null,
          clubName: row.competitionEntry.club?.name ?? null,
          sourceRank: row.rank,
          sourceHeat,
        });
        continue;
      }
      if (row.entryType === "TEAM" && row.teamEntry) {
        participants.push({
          kind: "TEAM",
          teamEntryId: row.teamEntry.id,
          teamName: row.teamEntry.teamName,
          clubId: row.teamEntry.club?.id ?? null,
          clubName: row.teamEntry.club?.name ?? null,
          members: row.teamEntry.members
            .map((member) => `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim())
            .filter(Boolean),
          sourceRank: row.rank,
          sourceHeat,
        });
      }
    }

    if (participants.length === 0) {
      return NextResponse.json(
        { error: "次ラウンド生成対象の参加者がいません" },
        { status: 400 }
      );
    }

    let heatCountForLayout = useUniformTop
      ? payload.mode === "size"
        ? resolveHeatCount(participants.length, {
            mode: "size",
            heatSize: String(payload.heatSize ?? 8),
          })
        : resolveHeatCount(participants.length, {
            mode: payload.mode ?? eventSetting?.mode ?? "count",
            heatCount: eventSetting?.heatCount ?? String(fallbackNextHeats),
            heatSize:
              typeof payload.heatSize === "number"
                ? String(payload.heatSize)
                : eventSetting?.heatSize ?? "8",
          })
      : typeof maxLanes === "number" && Number.isFinite(maxLanes) && maxLanes >= 1
        ? enforceMinHeatCountForMaxLanes(
            participants.length,
            nextHeatCountForCapacity,
            maxLanes
          )
        : resolveHeatCountForSnapshotTransition({
            setting: eventSetting,
            participantTotal: participants.length,
            fromRound: payload.fromRound,
            toRound: payload.toRound,
            requestedHeatCount: typeof payload.heatCount === "number" ? payload.heatCount : undefined,
          });

    if (
      useUniformTop &&
      typeof maxLanes === "number" &&
      Number.isFinite(maxLanes) &&
      maxLanes >= 1
    ) {
      heatCountForLayout = enforceMinHeatCountForMaxLanes(
        participants.length,
        heatCountForLayout,
        maxLanes
      );
    }

    const shuffleFingerprint = [...participants]
      .map((p) => (p.kind === "INDIVIDUAL" ? p.entryId : p.teamEntryId))
      .sort()
      .join(",");
    const shuffleSeed = computePlacementSeed(
      competitionId,
      payload.eventId,
      `nextRound:${payload.fromRound}>${payload.toRound}:${shuffleFingerprint}`
    );

    const heats = buildNextRoundHeatsFromPreviousResults({
      participants,
      heatCount: heatCountForLayout,
      shuffleSeed,
    });
    const nextRoundData: StartListRoundData = {
      round: payload.toRound as StartListRound,
      generatedAt: new Date().toISOString(),
      generatedBy: "RESULT_BASED",
      sourceRound: payload.fromRound as StartListRound,
      heats,
    };

    const actualBySourceHeat = countStartListParticipantsBySourceHeat(participants);
    const advanceQuotasByOfficialHeat = useUniformTop
      ? heatEntries.map(([heatKey, rows]) => ({
          heat: heatKey,
          quota: Math.min(Math.max(1, payload.topPerHeat!), rows.length),
          actual: actualBySourceHeat.get(heatKey) ?? 0,
        }))
      : heatEntries.map(([heatKey], i) => ({
          heat: heatKey,
          quota: advancePerHeat![i] ?? 0,
          actual: actualBySourceHeat.get(heatKey) ?? 0,
        }));

    const raw = (snapshot.data && typeof snapshot.data === "object"
      ? (snapshot.data as SnapshotData)
      : {}) as SnapshotData;
    const events = Array.isArray(raw.events) ? raw.events : [];
    let touched = false;
    const nextEvents = events.map((item) => {
      if (item.eventId !== payload.eventId) return item;
      touched = true;
      const rounds = Array.isArray(item.rounds) ? item.rounds : [];
      return {
        ...item,
        rounds: mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas({
          prevRounds: rounds,
          nextRoundData,
          fromRound: payload.fromRound as StartListRound,
          advanceQuotasByOfficialHeat,
        }),
      };
    });
    if (!touched) {
      nextEvents.push({
        eventId: event.id,
        name: event.name,
        sex: event.sex as "MALE" | "FEMALE" | "OTHER",
        type: event.type as "INDIVIDUAL" | "TEAM",
        rounds: reorderRounds([nextRoundData]),
      });
    }

    await prisma.competitionStartListSnapshot.update({
      where: { id: snapshot.id },
      data: {
        data: {
          ...(raw ?? {}),
          version: typeof raw.version === "number" ? raw.version : 2,
          events: nextEvents,
        },
      },
    });

    return NextResponse.json({
      message: `${payload.fromRound}の結果を元に${payload.toRound}を生成しました`,
      eventId: payload.eventId,
      round: payload.toRound,
      heatCount: heats.length,
      participantCount: participants.length,
      selectionMode: useUniformTop ? ("uniform" as const) : ("proportional" as const),
      nextHeatCountRequested: heatCountForLayout,
      nextHeatCountForCapacity,
      maxLanesPerHeat: maxLanes ?? null,
      advancePerSourceHeat: advancePerHeat,
      sourceHeatSizes,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/start-list-snapshot/rounds/route.ts", error);
  }
}
