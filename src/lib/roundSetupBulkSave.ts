import type { Prisma } from "@prisma/client";
import {
  buildStartListSettingsPayload,
  clampStartListRoundCount,
  normalizeHeatSettingForPersist,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
  type StartListRoundTab,
} from "@/lib/startListSettings";
import {
  parseRoundScheduledStarts,
  pruneRoundScheduledStarts,
  roundScheduledStartsToPrismaJson,
} from "@/lib/eventRoundScheduledStarts";

export type RoundSetupBulkSaveItem = {
  eventId: string;
  startListRoundCount: number;
  roundTabs: StartListRoundTab[];
};

export function parseRoundSetupBulkSaveItems(raw: unknown):
  | { ok: true; items: RoundSetupBulkSaveItem[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "items が必要です" };
  }
  const items: RoundSetupBulkSaveItem[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      return { ok: false, message: "items の形式が不正です" };
    }
    const r = row as Record<string, unknown>;
    const eventId = r.eventId;
    if (typeof eventId !== "string" || !eventId.trim()) {
      return { ok: false, message: "eventId が必要です" };
    }
    if (seen.has(eventId)) {
      return { ok: false, message: "同一の種目 ID が重複しています" };
    }
    seen.add(eventId);

    const rcRaw = r.startListRoundCount;
    let nextRound: number;
    if (typeof rcRaw === "number" && Number.isInteger(rcRaw)) {
      nextRound = rcRaw;
    } else if (typeof rcRaw === "string" && /^\d+$/.test(rcRaw.trim())) {
      nextRound = parseInt(rcRaw.trim(), 10);
    } else {
      return { ok: false, message: "スタートリストのラウンド数は1〜32の整数にしてください" };
    }
    nextRound = clampStartListRoundCount(nextRound);
    if (nextRound < 1 || nextRound > 32) {
      return {
        ok: false,
        message: "スタートリストのラウンド数は1〜32の範囲で指定してください",
      };
    }

    if (!Array.isArray(r.roundTabs)) {
      return { ok: false, message: "roundTabs が必要です" };
    }
    const tabs = normalizeRoundTabs({ roundTabs: r.roundTabs as StartListRoundTab[] });
    if (tabs.length !== nextRound) {
      return {
        ok: false,
        message: `種目 ${eventId} の roundTabs の数がラウンド数と一致しません`,
      };
    }

    items.push({ eventId, startListRoundCount: nextRound, roundTabs: tabs });
  }
  return { ok: true, items };
}

/** items を既存 envelope にマージした HeatSetting マップ */
export function mergeBulkSaveItemsIntoEventSettings(
  existingParsed: ReturnType<typeof parseStartListSettings>,
  items: RoundSetupBulkSaveItem[]
): Record<string, HeatSetting> {
  const next = { ...existingParsed.eventSettings };
  for (const item of items) {
    const prev = existingParsed.eventSettings[item.eventId];
    next[item.eventId] = normalizeHeatSettingForPersist({
      roundTabs: item.roundTabs,
      ...(Array.isArray(prev?.progressionHeatCounts) && prev.progressionHeatCounts.length > 0
        ? { progressionHeatCounts: prev.progressionHeatCounts }
        : {}),
    });
  }
  return next;
}

export function buildEventUpdatesForBulkSave(params: {
  items: RoundSetupBulkSaveItem[];
  eventsById: Map<
    string,
    { roundScheduledStarts: unknown; startListRoundCount: number; marshalStartedAt: Date | null }
  >;
}): Array<{
  eventId: string;
  startListRoundCount: number;
  roundScheduledStarts: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}> {
  return params.items.map((item) => {
    const ev = params.eventsById.get(item.eventId);
    const pruned = pruneRoundScheduledStarts(
      parseRoundScheduledStarts(ev?.roundScheduledStarts),
      item.startListRoundCount
    );
    return {
      eventId: item.eventId,
      startListRoundCount: item.startListRoundCount,
      roundScheduledStarts: roundScheduledStartsToPrismaJson(pruned),
    };
  });
}

export function buildBulkSaveSettingsPayload(
  existingParsed: ReturnType<typeof parseStartListSettings>,
  mergedEventSettings: Record<string, HeatSetting>
): Prisma.InputJsonValue {
  return buildStartListSettingsPayload({
    eventSettings: mergedEventSettings,
    teamAssignmentDeadline: existingParsed.teamAssignmentDeadline,
  }) as Prisma.InputJsonValue;
}
