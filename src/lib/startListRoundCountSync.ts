import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  buildRoundTabsForRoundCount,
  buildStartListSettingsPayload,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";

/** 大会 JSON の該当種目だけ roundTabs を差し替えて保存 */
export async function syncStartListSettingsRoundTabsForEvent(params: {
  competitionId: string;
  eventId: string;
  roundCount: number;
}): Promise<void> {
  const { competitionId, eventId, roundCount } = params;
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { startListSettings: true },
  });
  if (!competition) return;

  const { eventSettings, teamAssignmentDeadline } = parseStartListSettings(
    competition.startListSettings
  );
  const prev = eventSettings[eventId];
  const prevTabs = normalizeRoundTabs(prev ?? {});
  const newTabs = buildRoundTabsForRoundCount(roundCount, prevTabs);

  const progLen = Math.max(0, newTabs.length - 1);
  const oldProg = prev?.progressionHeatCounts ?? [];
  const nextProg: number[] =
    progLen > 0
      ? Array.from({ length: progLen }, (_, i) => {
          const v = oldProg[i];
          return typeof v === "number" && v >= 1 && v <= 64 ? Math.floor(v) : 1;
        })
      : [];

  const head = newTabs[0];
  const nextSetting: HeatSetting = {
    roundTabs: newTabs,
    ...(progLen > 0 ? { progressionHeatCounts: nextProg } : {}),
    mode: head?.mode ?? "count",
    heatCount: head?.heatCount ?? "1",
    heatSize: head?.heatSize ?? "",
  };

  const nextEvents = { ...eventSettings, [eventId]: nextSetting };
  const payload = buildStartListSettingsPayload({
    eventSettings: nextEvents,
    teamAssignmentDeadline,
  });

  await prisma.competition.update({
    where: { id: competitionId },
    data: { startListSettings: payload as Prisma.InputJsonValue },
  });
}

/** startListSettings の roundTabs 長に合わせ、全種目の startListRoundCount を揃える */
export async function syncAllEventStartListRoundCountsFromSettings(
  competitionId: string
): Promise<void> {
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      startListSettings: true,
      events: { select: { id: true } },
    },
  });
  if (!comp) return;
  const { eventSettings } = parseStartListSettings(comp.startListSettings);
  await prisma.$transaction(
    comp.events.map((e) => {
      const len = normalizeRoundTabs(eventSettings[e.id] ?? {}).length;
      const n = Math.min(32, Math.max(1, len || 1));
      return prisma.event.update({
        where: { id: e.id },
        data: { startListRoundCount: n },
      });
    })
  );
}
