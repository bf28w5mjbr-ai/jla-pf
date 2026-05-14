import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  buildRoundTabsForRoundCount,
  buildStartListSettingsPayload,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";

/** メモリ上の startListSettings.events に、1 種目分のラウンド数変更を反映する（DB 書き込みなし） */
export function mergeRoundTabUpdateIntoEventSettings(
  eventSettings: Record<string, HeatSetting>,
  eventId: string,
  roundCount: number
): Record<string, HeatSetting> {
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

  return { ...eventSettings, [eventId]: nextSetting };
}

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
  const nextEvents = mergeRoundTabUpdateIntoEventSettings(
    eventSettings,
    eventId,
    roundCount
  );
  const payload = buildStartListSettingsPayload({
    eventSettings: nextEvents,
    teamAssignmentDeadline,
  });

  await prisma.competition.update({
    where: { id: competitionId },
    data: { startListSettings: payload as Prisma.InputJsonValue },
  });
}

/**
 * 複数種目のラウンド数を一度に反映（大会 startListSettings は 1 回の読み書き＋各 Event 行を同一トランザクションで更新）。
 */
export async function syncStartListSettingsRoundTabsForEvents(params: {
  competitionId: string;
  items: Array<{ eventId: string; roundCount: number }>;
}): Promise<void> {
  const { competitionId, items } = params;
  if (items.length === 0) return;

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { startListSettings: true },
  });
  if (!competition) return;

  const { eventSettings, teamAssignmentDeadline } = parseStartListSettings(
    competition.startListSettings
  );
  let nextEvents = { ...eventSettings };
  for (const { eventId, roundCount } of items) {
    nextEvents = mergeRoundTabUpdateIntoEventSettings(nextEvents, eventId, roundCount);
  }
  const payload = buildStartListSettingsPayload({
    eventSettings: nextEvents,
    teamAssignmentDeadline,
  });

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: competitionId },
      data: { startListSettings: payload as Prisma.InputJsonValue },
    });
    for (const { eventId, roundCount } of items) {
      await tx.event.update({
        where: { id: eventId },
        data: { startListRoundCount: roundCount },
      });
    }
  });
}

/** startListSettings の roundTabs 長に合わせ、全種目の startListRoundCount を揃える */
export async function syncAllEventStartListRoundCountsFromSettings(
  competitionId: string,
  options?: {
    /** 直前に保存した startListSettings（大会行の再取得を省略） */
    startListSettings?: unknown;
    /** 種目 id 一覧（startListSettings とセットで渡す） */
    eventIds?: readonly string[];
  }
): Promise<void> {
  let startListSettings: unknown;
  let eventIds: readonly string[];

  if (options?.startListSettings !== undefined && options.eventIds !== undefined) {
    startListSettings = options.startListSettings;
    eventIds = options.eventIds;
  } else {
    const comp = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        startListSettings: true,
        events: { select: { id: true } },
      },
    });
    if (!comp) return;
    startListSettings = comp.startListSettings;
    eventIds = comp.events.map((e) => e.id);
  }

  if (eventIds.length === 0) return;

  const { eventSettings } = parseStartListSettings(startListSettings);
  await prisma.$transaction(
    eventIds.map((id) => {
      const len = normalizeRoundTabs(eventSettings[id] ?? {}).length;
      const n = Math.min(32, Math.max(1, len || 1));
      return prisma.event.update({
        where: { id },
        data: { startListRoundCount: n },
      });
    })
  );
}
