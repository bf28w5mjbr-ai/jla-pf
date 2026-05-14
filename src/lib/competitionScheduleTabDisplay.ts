import {
  buildRoundTabsForRoundCount,
  defaultStartListRoundTabLabels,
  normalizeRoundTabs,
  type HeatSetting,
} from "@/lib/startListSettings";

export type CompetitionScheduleTabLite = {
  id: string;
  name: string;
  displayOrder: number;
};

export type EventWithScheduleTab = {
  id: string;
  scheduleTabId?: string | null;
  scheduleTabSortOrder?: number | null;
};

/** タブ一覧（displayOrder 昇順）に沿い、タブ内は scheduleTabSortOrder → id */
export function sortEventsByScheduleTabs<T extends EventWithScheduleTab>(
  events: readonly T[],
  tabs: readonly CompetitionScheduleTabLite[]
): T[] {
  const tabRank = new Map(tabs.map((t, i) => [t.id, i]));
  return [...events].sort((a, b) => {
    const ra = a.scheduleTabId && tabRank.has(a.scheduleTabId) ? tabRank.get(a.scheduleTabId)! : 1_000_000;
    const rb = b.scheduleTabId && tabRank.has(b.scheduleTabId) ? tabRank.get(b.scheduleTabId)! : 1_000_001;
    if (ra !== rb) return ra - rb;
    const oa = a.scheduleTabSortOrder ?? 0;
    const ob = b.scheduleTabSortOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

export function filterEventsByScheduleTabId<T extends EventWithScheduleTab>(
  events: readonly T[],
  tabId: string
): T[] {
  return events.filter((e) => e.scheduleTabId === tabId);
}

export type ScheduleTabListItem = {
  id: string;
  name: string;
  /** そのタブに属する種目数 */
  eventCount: number;
};

export function buildScheduleTabListItems(
  tabs: readonly CompetitionScheduleTabLite[],
  events: readonly EventWithScheduleTab[]
): ScheduleTabListItem[] {
  return tabs.map((t) => ({
    id: t.id,
    name: t.name,
    eventCount: events.filter((e) => e.scheduleTabId === t.id).length,
  }));
}

export function parseScheduleRoundCountDraft(raw: string | undefined, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 32) return Math.min(32, Math.max(1, fallback));
  return n;
}

export type ScheduleRoundRow<T extends { id: string }> = {
  event: T;
  roundIndex: number;
  roundLabel: string;
};

/** 種目×ラウンドのフラット行（表示・リンク用） */
export function expandEventsToScheduleRoundRows<T extends { id: string; startListRoundCount?: number }>(
  events: readonly T[],
  roundCountDraftByEventId: Record<string, string>,
  heatSettingForEvent: (eventId: string) => HeatSetting
): ScheduleRoundRow<T>[] {
  const rows: ScheduleRoundRow<T>[] = [];
  for (const event of events) {
    const draft = roundCountDraftByEventId[event.id];
    const saved =
      typeof event.startListRoundCount === "number" &&
      Number.isInteger(event.startListRoundCount) &&
      event.startListRoundCount >= 1
        ? event.startListRoundCount
        : 1;
    const n = parseScheduleRoundCountDraft(draft, saved);
    const merged = heatSettingForEvent(event.id);
    const tabs = buildRoundTabsForRoundCount(n, normalizeRoundTabs(merged));
    const defaults = defaultStartListRoundTabLabels(n);
    for (let i = 0; i < n; i += 1) {
      const label =
        tabs[i]?.label?.trim() || defaults[i]?.trim() || `ラウンド ${i + 1}`;
      rows.push({ event, roundIndex: i, roundLabel: label });
    }
  }
  return rows;
}
