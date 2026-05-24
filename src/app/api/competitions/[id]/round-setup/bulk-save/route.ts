import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { validateEventSettingsRoundTabHeatMonotonic } from "@/lib/startListEventHeatValidation";
import {
  assertHeatSettingsUnchangedForMarshalLockedEvents,
  mergeEventSettingsForMarshalCompare,
} from "@/lib/eventHeatPlanMarshal";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { replaceCompetitionStartListSnapshotWithAudit } from "@/lib/replaceStartListSnapshotWithAudit";
import { eventIdsWhereHeatPlanSplitChanged } from "@/lib/startListSnapshot";
import { parseStartListSettings } from "@/lib/startListSettings";
import {
  buildBulkSaveSettingsPayload,
  buildEventUpdatesForBulkSave,
  mergeBulkSaveItemsIntoEventSettings,
  parseRoundSetupBulkSaveItems,
} from "@/lib/roundSetupBulkSave";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);
    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ message: "認証または当日運用アクセスが必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      items?: unknown;
      captureSnapshot?: unknown;
      confirmEventIds?: unknown;
    } | null;

    const parsedItems = parseRoundSetupBulkSaveItems(body?.items);
    if (!parsedItems.ok) {
      return NextResponse.json({ message: parsedItems.message }, { status: 400 });
    }
    const items = parsedItems.items;
    const shouldCaptureSnapshot = body?.captureSnapshot !== false;

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
            },
          },
        },
        events: {
          select: {
            id: true,
            type: true,
            preliminaryHeatLaneCount: true,
            roundScheduledStarts: true,
            startListRoundCount: true,
            marshalStartedAt: true,
            startListHeatPlanConfirmedAt: true,
          },
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        orgStatus: competition.organization.status,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const eventIdSet = new Set(competition.events.map((e) => e.id));
    for (const item of items) {
      if (!eventIdSet.has(item.eventId)) {
        return NextResponse.json({ message: "種目が見つかりません" }, { status: 400 });
      }
    }

    const eventsById = new Map(competition.events.map((e) => [e.id, e]));
    for (const item of items) {
      const ev = eventsById.get(item.eventId)!;
      if (ev.marshalStartedAt && ev.startListRoundCount !== item.startListRoundCount) {
        return NextResponse.json(
          { message: "マーシャル開始後はスタートリストのラウンド数を変更できません" },
          { status: 409 }
        );
      }
    }

    const existingParsed = parseStartListSettings(competition.startListSettings);
    const mergedEventSettings = mergeBulkSaveItemsIntoEventSettings(existingParsed, items);
    const eventIdList = [...eventIdSet];

    const [entryItemGroups, teamEntryGroups] = await Promise.all([
      eventIdList.length === 0
        ? Promise.resolve([] as { eventId: string; _count: { id: number } }[])
        : prisma.entryItem.groupBy({
            by: ["eventId"],
            where: {
              eventId: { in: eventIdList },
              entry: {
                competitionId,
                status: "SUBMITTED",
                ...competitionEntryEligibleForStartListWhere,
              },
            },
            _count: { id: true },
          }),
      eventIdList.length === 0
        ? Promise.resolve([] as { eventId: string; _count: { id: number } }[])
        : prisma.teamEntry.groupBy({
            by: ["eventId"],
            where: { competitionId, eventId: { in: eventIdList } },
            _count: { id: true },
          }),
    ]);

    const individualByEvent: Record<string, number> = {};
    for (const row of entryItemGroups) {
      individualByEvent[row.eventId] = row._count.id;
    }
    const teamByEvent: Record<string, number> = {};
    for (const row of teamEntryGroups) {
      teamByEvent[row.eventId] = row._count.id;
    }

    const eventMeta: Record<
      string,
      { entryCount: number; preliminaryHeatLaneCount: number | null }
    > = {};
    for (const e of competition.events) {
      eventMeta[e.id] = {
        entryCount:
          e.type === "TEAM" ? (teamByEvent[e.id] ?? 0) : (individualByEvent[e.id] ?? 0),
        preliminaryHeatLaneCount: e.preliminaryHeatLaneCount,
      };
    }

    const nextEventSettingsForMarshalGate = mergeEventSettingsForMarshalCompare({
      eventIds: eventIdList,
      previous: existingParsed.eventSettings,
      proposed: mergedEventSettings,
    });

    const monotonic = validateEventSettingsRoundTabHeatMonotonic(
      nextEventSettingsForMarshalGate,
      eventMeta
    );
    if (!monotonic.ok) {
      return NextResponse.json({ message: monotonic.message }, { status: 400 });
    }

    const marshalGate = await assertHeatSettingsUnchangedForMarshalLockedEvents({
      prisma,
      competitionId,
      previousEnvelope: existingParsed,
      nextEventSettings: nextEventSettingsForMarshalGate,
    });
    if (!marshalGate.ok) {
      return NextResponse.json({ message: marshalGate.message }, { status: 409 });
    }

    const payloadToSave = buildBulkSaveSettingsPayload(existingParsed, mergedEventSettings);
    const eventUpdates = buildEventUpdatesForBulkSave({ items, eventsById });

    const updated = await prisma.$transaction(async (tx) => {
      for (const upd of eventUpdates) {
        await tx.event.update({
          where: { id: upd.eventId },
          data: {
            startListRoundCount: upd.startListRoundCount,
            roundScheduledStarts: upd.roundScheduledStarts,
          },
        });
      }
      return tx.competition.update({
        where: { id: competitionId },
        data: { startListSettings: payloadToSave },
        select: { id: true, startListSettings: true },
      });
    });

    type SnapshotCapturePayload =
      | {
          ok: true;
          snapshotId: string;
          wasUpdate: boolean;
          skipped?: boolean;
          partialRebuild?: boolean;
        }
      | { ok: false; error: string };

    let snapshotCapture: SnapshotCapturePayload | undefined;
    if (shouldCaptureSnapshot) {
      const heatPlanChangedIds = eventIdsWhereHeatPlanSplitChanged({
        orderedEventIds: competition.events.map((e) => e.id),
        previous: existingParsed.eventSettings,
        next: mergedEventSettings,
      });
      try {
        const snap = await replaceCompetitionStartListSnapshotWithAudit(request, {
          competitionId,
          sessionUserId,
          onlyRebuildEventIds: heatPlanChangedIds,
        });
        snapshotCapture = {
          ok: true,
          snapshotId: snap.snapshotId,
          wasUpdate: snap.wasUpdate,
          skipped: snap.skipped,
          partialRebuild: snap.partialRebuild,
        };
      } catch (snapErr) {
        snapshotCapture = {
          ok: false,
          error:
            snapErr instanceof Error
              ? snapErr.message
              : "スタートリスト記録の更新に失敗しました（設定は保存済みです）。",
        };
      }
    }

    const confirmIdsRaw = body?.confirmEventIds;
    let confirmEventIds: string[];
    if (Array.isArray(confirmIdsRaw) && confirmIdsRaw.length > 0) {
      confirmEventIds = confirmIdsRaw.filter(
        (id): id is string => typeof id === "string" && eventIdSet.has(id)
      );
    } else {
      confirmEventIds = items
        .map((i) => i.eventId)
        .filter((id) => {
          const ev = eventsById.get(id);
          return ev && !ev.startListHeatPlanConfirmedAt && !ev.marshalStartedAt;
        });
    }

    const now = new Date();
    const confirmResults: Array<{ eventId: string; ok: boolean; message?: string }> = [];
    for (const eventId of confirmEventIds) {
      const ev = eventsById.get(eventId);
      if (!ev) continue;
      if (ev.marshalStartedAt) {
        confirmResults.push({
          eventId,
          ok: false,
          message: "マーシャル開始後はステップ1の状態を変更できません",
        });
        continue;
      }
      if (ev.startListHeatPlanConfirmedAt) {
        confirmResults.push({ eventId, ok: true });
        continue;
      }
      await prisma.event.update({
        where: { id: eventId },
        data: { startListHeatPlanConfirmedAt: now },
      });
      confirmResults.push({ eventId, ok: true });
    }

    return NextResponse.json({
      message: "ラウンド設定を一括保存しました",
      competition: updated,
      confirmResults,
      ...(snapshotCapture !== undefined ? { snapshotCapture } : {}),
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/round-setup/bulk-save/route.ts",
      error
    );
  }
}
