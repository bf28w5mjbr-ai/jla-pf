import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  validateEventSettingsRoundTabHeatMonotonic,
  validateOfficialEventHeatMap,
} from "@/lib/startListEventHeatValidation";
import {
  buildStartListSettingsPayload,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";
import {
  assertHeatSettingsUnchangedForMarshalLockedEvents,
  mergeEventSettingsForMarshalCompare,
} from "@/lib/eventHeatPlanMarshal";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { syncAllEventStartListRoundCountsFromSettings } from "@/lib/startListRoundCountSync";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
        events: {
          select: { id: true, type: true, preliminaryHeatLaneCount: true },
          orderBy: { displayOrder: "asc" },
        },
        officialApplications: {
          where: { userId: session.userId },
          select: { status: true },
          take: 1,
        },
        officialAttendances: {
          where: { userId: session.userId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: competition.organization.admins,
        officialApplicationStatus: competition.officialApplications[0]?.status ?? null,
        hasOfficialAttendance: competition.officialAttendances.length > 0,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const isAdmin = hasOrgAdminAccess(competition.organization.admins);

    const body = await request.json().catch(() => ({}));
    const { startListSettings } = body as { startListSettings?: unknown };

    if (typeof startListSettings !== "object" || startListSettings === null) {
      return NextResponse.json(
        { message: "startListSettings の形式が正しくありません" },
        { status: 400 }
      );
    }

    const settingsRecord = startListSettings as Record<string, unknown>;
    delete settingsRecord.globalSplit;

    const eventIdSet = new Set(competition.events.map((e) => e.id));
    const eventIdList = [...eventIdSet];
    const existingParsed = parseStartListSettings(competition.startListSettings);

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
                OR: [
                  { totalFee: { lte: 0 } },
                  { checkoutSessions: { some: { status: "COMPLETED" } } },
                ],
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
          e.type === "TEAM"
            ? (teamByEvent[e.id] ?? 0)
            : (individualByEvent[e.id] ?? 0),
        preliminaryHeatLaneCount: e.preliminaryHeatLaneCount,
      };
    }

    let payloadToSave: Prisma.InputJsonValue;
    let nextEventSettingsForMarshalGate: Record<string, HeatSetting>;
    let eventSettingsForMonotonic: Record<string, HeatSetting>;

    if (isAdmin) {
      payloadToSave = settingsRecord as Prisma.InputJsonValue;
      const proposedParsed = parseStartListSettings(settingsRecord);
      nextEventSettingsForMarshalGate = mergeEventSettingsForMarshalCompare({
        eventIds: [...eventIdSet],
        previous: existingParsed.eventSettings,
        proposed: proposedParsed.eventSettings,
      });
      eventSettingsForMonotonic = proposedParsed.eventSettings;
    } else {
      if (!Object.prototype.hasOwnProperty.call(settingsRecord, "events")) {
        return NextResponse.json(
          { message: "オフィシャルが更新できるのは種目別ヒート／レーン（events）のみです" },
          { status: 400 }
        );
      }
      const validated = validateOfficialEventHeatMap(settingsRecord.events, eventIdSet);
      if ("error" in validated) {
        return NextResponse.json({ message: validated.error }, { status: 400 });
      }
      const mergedEventSettings: Record<string, HeatSetting> = {};
      for (const id of eventIdSet) {
        const prev = existingParsed.eventSettings[id];
        mergedEventSettings[id] = {
          ...validated[id],
          ...(Array.isArray(prev?.progressionHeatCounts) && prev.progressionHeatCounts.length > 0
            ? { progressionHeatCounts: prev.progressionHeatCounts }
            : {}),
        };
      }
      payloadToSave = buildStartListSettingsPayload({
        eventSettings: mergedEventSettings,
        teamAssignmentDeadline: existingParsed.teamAssignmentDeadline,
      }) as Prisma.InputJsonValue;
      nextEventSettingsForMarshalGate = mergedEventSettings;
      eventSettingsForMonotonic = mergedEventSettings;
    }

    const monotonic = validateEventSettingsRoundTabHeatMonotonic(
      eventSettingsForMonotonic,
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

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        startListSettings: payloadToSave,
      },
      select: {
        id: true,
        startListSettings: true,
      },
    });

    await syncAllEventStartListRoundCountsFromSettings(competitionId);

    return NextResponse.json({
      message: "スタートリスト設定を更新しました",
      competition: updated,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/start-list-settings/route.ts", error);
  }
}
