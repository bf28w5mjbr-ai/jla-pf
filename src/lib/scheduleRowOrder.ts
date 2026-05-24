import { roundStartKey } from "@/lib/eventRoundScheduledStarts";

export const SCHEDULE_ROW_UNASSIGNED_DAY_KEY = "__unassigned__";

/** @deprecated 読み取り時 migrate 用。新規書き込みでは使用しない */
export function migrateUnassignedKeysInOrderByDay(
  byDay: ScheduleRowOrderByDay,
  defaultDayKey: string
): ScheduleRowOrderByDay {
  const unassigned = byDay[SCHEDULE_ROW_UNASSIGNED_DAY_KEY];
  if (!unassigned?.length) {
    const { [SCHEDULE_ROW_UNASSIGNED_DAY_KEY]: _, ...rest } = byDay;
    return rest;
  }
  const merged = { ...byDay };
  delete merged[SCHEDULE_ROW_UNASSIGNED_DAY_KEY];
  const existing = merged[defaultDayKey] ?? [];
  const seen = new Set(existing);
  for (const key of unassigned) {
    if (!seen.has(key)) {
      existing.push(key);
      seen.add(key);
    }
  }
  merged[defaultDayKey] = existing;
  return merged;
}

export type ScheduleRowRef = { eventId: string; roundIndex: number };

export type ScheduleRowOrderByDay = Record<string, string[]>;

/** dayKey → tabId → row keys（UI・API 向け） */
export type ScheduleDayAreaPartition = Record<string, Record<string, string[]>>;

/** @deprecated 旧 flat partition（tabId → keys）。by-day 移行後は derive 用のみ */
export type ScheduleRowPartition = Record<string, string[]>;

export function formatScheduleRowKey(eventId: string, roundIndex: number): string {
  return roundStartKey(eventId, roundIndex);
}

export function parseScheduleRowKey(key: string): ScheduleRowRef | null {
  const i = key.lastIndexOf(":");
  if (i <= 0) return null;
  const eventId = key.slice(0, i);
  const roundIndex = Number.parseInt(key.slice(i + 1), 10);
  if (!eventId || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 31) {
    return null;
  }
  return { eventId, roundIndex };
}

function parseRowKeyArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    if (!parseScheduleRowKey(item)) return null;
    out.push(item);
  }
  return out;
}

/** 新形式 Record<dayKey, string[]> を検証。旧 string[] は defaultDayKey へ正規化 */
export function parseScheduleRowOrderByDayJson(
  raw: unknown,
  defaultDayKey?: string
): ScheduleRowOrderByDay | null {
  if (raw === null || raw === undefined) return null;

  const legacy = parseRowKeyArray(raw);
  if (legacy) {
    if (!defaultDayKey) return null;
    return { [defaultDayKey]: legacy };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const out: ScheduleRowOrderByDay = {};
  for (const [dayKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof dayKey !== "string" || !dayKey.trim()) return null;
    const keys = parseRowKeyArray(value);
    if (!keys) return null;
    out[dayKey] = keys;
  }
  if (defaultDayKey) {
    return migrateUnassignedKeysInOrderByDay(out, defaultDayKey);
  }
  return out;
}

/** 後方互換: 旧 string[] または by-day の全行を flat 配列に（最初のタブ出現順） */
export function parseScheduleRowOrderJson(
  raw: unknown,
  defaultDayKey?: string
): string[] | null {
  const byDay = parseScheduleRowOrderByDayJson(raw, defaultDayKey);
  if (!byDay) return null;
  const flat: string[] = [];
  const seen = new Set<string>();
  for (const keys of Object.values(byDay)) {
    for (const key of keys) {
      if (seen.has(key)) continue;
      flat.push(key);
      seen.add(key);
    }
  }
  return flat;
}

export function flattenScheduleRowOrderByDay(byDay: ScheduleRowOrderByDay): string[] {
  return parseScheduleRowOrderJson(byDay) ?? [];
}

export function buildDefaultScheduleRowOrder(
  events: readonly { id: string }[],
  roundCountByEventId: Record<string, number>
): string[] {
  const keys: string[] = [];
  for (const event of events) {
    const n = Math.min(32, Math.max(1, roundCountByEventId[event.id] ?? 1));
    for (let i = 0; i < n; i += 1) {
      keys.push(formatScheduleRowKey(event.id, i));
    }
  }
  return keys;
}

/** 保存済み行順を expected と突き合わせ、欠落行を種目ブロック末尾へ、余剰行を除去 */
export function reconcileScheduleRowOrder(
  savedKeys: string[] | null | undefined,
  expectedKeys: string[]
): string[] {
  const expectedSet = new Set(expectedKeys);
  if (!savedKeys?.length) return expectedKeys;

  const result: string[] = [];
  const seen = new Set<string>();

  for (const key of savedKeys) {
    if (expectedSet.has(key) && !seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }

  const missing = expectedKeys.filter((k) => !seen.has(k));
  for (const key of missing) {
    const parsed = parseScheduleRowKey(key);
    if (!parsed) continue;
    let insertAt = result.length;
    for (let i = result.length - 1; i >= 0; i -= 1) {
      const prev = parseScheduleRowKey(result[i]!);
      if (prev?.eventId === parsed.eventId) {
        insertAt = i + 1;
        break;
      }
    }
    result.splice(insertAt, 0, key);
    seen.add(key);
  }

  if (result.length !== expectedKeys.length) return expectedKeys;
  return result;
}

export function orderScheduleRoundRows<T extends { event: { id: string }; roundIndex: number }>(
  rows: readonly T[],
  rowOrderKeys: readonly string[]
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    byKey.set(formatScheduleRowKey(row.event.id, row.roundIndex), row);
  }
  const ordered: T[] = [];
  const used = new Set<string>();
  for (const key of rowOrderKeys) {
    const row = byKey.get(key);
    if (row) {
      ordered.push(row);
      used.add(key);
    }
  }
  for (const row of rows) {
    const key = formatScheduleRowKey(row.event.id, row.roundIndex);
    if (!used.has(key)) ordered.push(row);
  }
  return ordered;
}

/** 行順から種目の scheduleTabSortOrder（1 始まり・初出順）を導出 */
export function deriveEventSortOrderFromRowOrder(
  rowOrderKeys: readonly string[]
): Map<string, number> {
  const map = new Map<string, number>();
  let order = 1;
  for (const key of rowOrderKeys) {
    const parsed = parseScheduleRowKey(key);
    if (!parsed || map.has(parsed.eventId)) continue;
    map.set(parsed.eventId, order);
    order += 1;
  }
  return map;
}

export function deriveEventSortOrderFromDayAreaPartition(
  partition: ScheduleDayAreaPartition,
  dayKeysInOrder: readonly string[]
): Map<string, number> {
  const flat: string[] = [];
  const seen = new Set<string>();
  for (const dayKey of dayKeysInOrder) {
    const tabMap = partition[dayKey];
    if (!tabMap) continue;
    for (const keys of Object.values(tabMap)) {
      for (const key of keys) {
        if (seen.has(key)) continue;
        flat.push(key);
        seen.add(key);
      }
    }
  }
  return deriveEventSortOrderFromRowOrder(flat);
}

export function roundCountForEvent(
  event: { id: string; startListRoundCount?: number },
  roundCountDraftByEventId: Record<string, string>,
  parseDraft: (raw: string | undefined, fallback: number) => number
): number {
  const saved =
    typeof event.startListRoundCount === "number" &&
    Number.isInteger(event.startListRoundCount) &&
    event.startListRoundCount >= 1
      ? event.startListRoundCount
      : 1;
  return parseDraft(roundCountDraftByEventId[event.id], saved);
}

/** 大会内の全行キー（種目×ラウンド） */
export function buildAllScheduleRowKeys(
  events: readonly { id: string }[],
  roundCountByEventId: Record<string, number>
): string[] {
  return buildDefaultScheduleRowOrder(events, roundCountByEventId);
}

function defaultTabIdForEvent(
  eventId: string,
  events: readonly { id: string; scheduleTabId?: string | null }[],
  tabs: readonly { id: string }[]
): string {
  const ev = events.find((e) => e.id === eventId);
  const tabIds = new Set(tabs.map((t) => t.id));
  if (ev?.scheduleTabId && tabIds.has(ev.scheduleTabId)) return ev.scheduleTabId;
  return tabs[0]?.id ?? "";
}

function insertKeyAfterEventBlock(list: string[], key: string): void {
  const parsed = parseScheduleRowKey(key);
  if (!parsed) {
    list.push(key);
    return;
  }
  let insertAt = list.length;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const prev = parseScheduleRowKey(list[i]!);
    if (prev?.eventId === parsed.eventId) {
      insertAt = i + 1;
      break;
    }
  }
  list.splice(insertAt, 0, key);
}

function emptyDayTabShell(tabIds: readonly string[]): Record<string, string[]> {
  const shell: Record<string, string[]> = {};
  for (const id of tabIds) shell[id] = [];
  return shell;
}

function ensureDayTabShell(
  partition: ScheduleDayAreaPartition,
  dayKey: string,
  tabIds: readonly string[]
): Record<string, string[]> {
  if (!partition[dayKey]) {
    partition[dayKey] = emptyDayTabShell(tabIds);
  }
  for (const id of tabIds) {
    if (!partition[dayKey]![id]) partition[dayKey]![id] = [];
  }
  return partition[dayKey]!;
}

function tabIdWithEventRowsInDay(
  eventId: string,
  dayKey: string,
  partition: ScheduleDayAreaPartition
): string | null {
  const tabMap = partition[dayKey];
  if (!tabMap) return null;
  for (const [tabId, keys] of Object.entries(tabMap)) {
    if (keys.some((k) => parseScheduleRowKey(k)?.eventId === eventId)) {
      return tabId;
    }
  }
  return null;
}

/**
 * 全タブの scheduleRowOrder（by-day）を統合し、各行キーがちょうど1日×1タブに属する partition を構築する。
 */
export function buildScheduleDayAreaPartition(input: {
  tabs: readonly { id: string; scheduleRowOrder?: unknown }[];
  events: readonly { id: string; scheduleTabId?: string | null }[];
  roundCountByEventId: Record<string, number>;
  competitionDayKeys: readonly string[];
  defaultDayKey: string;
}): ScheduleDayAreaPartition {
  const { tabs, events, roundCountByEventId, competitionDayKeys, defaultDayKey } = input;
  const tabIds = tabs.map((t) => t.id);
  const allExpected = buildAllScheduleRowKeys(events, roundCountByEventId);
  const allExpectedSet = new Set(allExpected);

  const partition: ScheduleDayAreaPartition = {};
  for (const dayKey of competitionDayKeys) {
    ensureDayTabShell(partition, dayKey, tabIds);
  }

  const assigned = new Set<string>();

  for (const tab of tabs) {
    const byDay = migrateUnassignedKeysInOrderByDay(
      parseScheduleRowOrderByDayJson(tab.scheduleRowOrder, defaultDayKey) ?? {},
      defaultDayKey
    );
    for (const [dayKey, keys] of Object.entries(byDay)) {
      if (dayKey === SCHEDULE_ROW_UNASSIGNED_DAY_KEY) continue;
      const shell = ensureDayTabShell(partition, dayKey, tabIds);
      for (const key of keys) {
        if (!allExpectedSet.has(key) || assigned.has(key)) continue;
        shell[tab.id]!.push(key);
        assigned.add(key);
      }
    }
  }

  for (const key of allExpected) {
    if (assigned.has(key)) continue;
    const parsed = parseScheduleRowKey(key);
    if (!parsed) continue;

    const existingDay = findDayForRowKey(key, partition);
    const existingTab =
      existingDay !== null
        ? findTabIdForRowKeyInDay(key, partition, existingDay)
        : tabIdWithEventRowsInAnyDay(parsed.eventId, partition);

    const dayKey = existingDay ?? defaultDayKey;
    const tabId =
      existingTab ?? defaultTabIdForEvent(parsed.eventId, events, tabs);
    const shell = ensureDayTabShell(partition, dayKey, tabIds);
    insertKeyAfterEventBlock(shell[tabId]!, key);
    assigned.add(key);
  }

  return partition;
}

function tabIdWithEventRowsInAnyDay(
  eventId: string,
  partition: ScheduleDayAreaPartition
): string | null {
  for (const dayKey of Object.keys(partition)) {
    const tabId = tabIdWithEventRowsInDay(eventId, dayKey, partition);
    if (tabId) return tabId;
  }
  return null;
}

export function findDayForRowKey(
  rowKey: string,
  partition: ScheduleDayAreaPartition
): string | null {
  for (const [dayKey, tabMap] of Object.entries(partition)) {
    for (const keys of Object.values(tabMap)) {
      if (keys.includes(rowKey)) return dayKey;
    }
  }
  return null;
}

export function findTabIdForRowKeyInDay(
  rowKey: string,
  partition: ScheduleDayAreaPartition,
  dayKey: string
): string | null {
  const tabMap = partition[dayKey];
  if (!tabMap) return null;
  for (const [tabId, keys] of Object.entries(tabMap)) {
    if (keys.includes(rowKey)) return tabId;
  }
  return null;
}

export function findDayTabForRowKey(
  rowKey: string,
  partition: ScheduleDayAreaPartition
): { dayKey: string; tabId: string } | null {
  const dayKey = findDayForRowKey(rowKey, partition);
  if (!dayKey) return null;
  const tabId = findTabIdForRowKeyInDay(rowKey, partition, dayKey);
  if (!tabId) return null;
  return { dayKey, tabId };
}

/** day×area partition → tab ごとの by-day JSON（DB 保存用） */
export function partitionByDayToByTab(
  partition: ScheduleDayAreaPartition,
  tabIds: readonly string[]
): Record<string, ScheduleRowOrderByDay> {
  const result: Record<string, ScheduleRowOrderByDay> = {};
  for (const tabId of tabIds) {
    result[tabId] = {};
  }
  for (const [dayKey, tabMap] of Object.entries(partition)) {
    if (dayKey === SCHEDULE_ROW_UNASSIGNED_DAY_KEY) continue;
    for (const tabId of tabIds) {
      const keys = tabMap[tabId] ?? [];
      if (keys.length > 0) {
        result[tabId]![dayKey] = [...keys];
      }
    }
  }
  return result;
}

/** 種目の primary エリア（:0 ラウンド所在、無ければ最初に見つかったラウンド） */
export function deriveEventPrimaryTabIdFromPartition(
  partition: ScheduleDayAreaPartition,
  eventId: string,
  tabIds: readonly string[]
): string | null {
  const tabIdSet = new Set(tabIds);
  for (let roundIndex = 0; roundIndex < 32; roundIndex += 1) {
    const rowKey = formatScheduleRowKey(eventId, roundIndex);
    const loc = findDayTabForRowKey(rowKey, partition);
    if (loc && tabIdSet.has(loc.tabId)) return loc.tabId;
  }
  return null;
}

/** タブの by-day JSON 等価比較（skip 更新判定用） */
export function tabScheduleRowOrderJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function normalizePartitionForCompare(
  partition: ScheduleDayAreaPartition
): ScheduleDayAreaPartition {
  const out: ScheduleDayAreaPartition = {};
  for (const dayKey of Object.keys(partition).sort()) {
    const tabMap = partition[dayKey];
    if (!tabMap) continue;
    out[dayKey] = {};
    for (const tabId of Object.keys(tabMap).sort()) {
      const keys = tabMap[tabId];
      if (keys?.length) out[dayKey]![tabId] = [...keys];
    }
  }
  return out;
}

/** day×area partition の深い等価比較 */
export function partitionsDeepEqual(
  a: ScheduleDayAreaPartition,
  b: ScheduleDayAreaPartition
): boolean {
  return (
    JSON.stringify(normalizePartitionForCompare(a)) ===
    JSON.stringify(normalizePartitionForCompare(b))
  );
}

/** 選択日の tabId → keys（旧 UI 互換ヘルパー） */
export function rowOrderByTabForDay(
  partition: ScheduleDayAreaPartition,
  dayKey: string,
  tabIds: readonly string[]
): ScheduleRowPartition {
  const tabMap = partition[dayKey] ?? emptyDayTabShell(tabIds);
  const out: ScheduleRowPartition = {};
  for (const tabId of tabIds) {
    out[tabId] = [...(tabMap[tabId] ?? [])];
  }
  return out;
}

export function moveRowKeyInDayAreaPartition(
  partition: ScheduleDayAreaPartition,
  rowKey: string,
  toDayKey: string,
  toTabId: string,
  tabIds: readonly string[],
  insertIndex?: number
): ScheduleDayAreaPartition | null {
  const from = findDayTabForRowKey(rowKey, partition);
  if (!from) return null;

  const next: ScheduleDayAreaPartition = {};
  for (const [dayKey, tabMap] of Object.entries(partition)) {
    next[dayKey] = {};
    for (const [tabId, keys] of Object.entries(tabMap)) {
      next[dayKey]![tabId] = [...keys];
    }
  }

  ensureDayTabShell(next, toDayKey, tabIds);
  if (!next[toDayKey]![toTabId]) return null;

  next[from.dayKey]![from.tabId] = next[from.dayKey]![from.tabId]!.filter((k) => k !== rowKey);
  const target = next[toDayKey]![toTabId]!;
  const idx =
    insertIndex !== undefined
      ? Math.max(0, Math.min(insertIndex, target.length))
      : target.length;
  target.splice(idx, 0, rowKey);

  return next;
}

/** @deprecated 旧 flat partition 用。新コードは moveRowKeyInDayAreaPartition を使用 */
export function buildScheduleRowPartition(input: {
  tabs: readonly { id: string; scheduleRowOrder?: string[] | null }[];
  events: readonly { id: string; scheduleTabId?: string | null }[];
  roundCountByEventId: Record<string, number>;
}): ScheduleRowPartition {
  const { tabs, events, roundCountByEventId } = input;
  const allExpected = buildAllScheduleRowKeys(events, roundCountByEventId);
  const allExpectedSet = new Set(allExpected);

  const partition: ScheduleRowPartition = {};
  for (const tab of tabs) partition[tab.id] = [];

  const assigned = new Set<string>();

  for (const tab of tabs) {
    const saved = parseRowKeyArray(tab.scheduleRowOrder ?? null) ?? [];
    for (const key of saved) {
      if (!allExpectedSet.has(key) || assigned.has(key)) continue;
      partition[tab.id]!.push(key);
      assigned.add(key);
    }
  }

  for (const key of allExpected) {
    if (assigned.has(key)) continue;
    const parsed = parseScheduleRowKey(key);
    if (!parsed) continue;
    const existingTab = findTabIdForRowKey(key, partition);
    const tabId =
      existingTab ?? defaultTabIdForEvent(parsed.eventId, events, tabs);
    if (!partition[tabId]) continue;
    insertKeyAfterEventBlock(partition[tabId]!, key);
    assigned.add(key);
  }

  return partition;
}

export function findTabIdForRowKey(
  rowKey: string,
  partition: ScheduleRowPartition
): string | null {
  for (const [tabId, keys] of Object.entries(partition)) {
    if (keys.includes(rowKey)) return tabId;
  }
  return null;
}

/** @deprecated 旧 flat partition 用 */
export function moveRowKeyInPartition(
  partition: ScheduleRowPartition,
  rowKey: string,
  toTabId: string,
  insertIndex?: number
): ScheduleRowPartition | null {
  const fromTabId = findTabIdForRowKey(rowKey, partition);
  if (!fromTabId || !partition[toTabId]) return null;

  const next: ScheduleRowPartition = {};
  for (const [id, keys] of Object.entries(partition)) {
    next[id] = [...keys];
  }

  next[fromTabId] = next[fromTabId]!.filter((k) => k !== rowKey);
  const target = next[toTabId]!;
  const idx =
    insertIndex !== undefined
      ? Math.max(0, Math.min(insertIndex, target.length))
      : target.length;
  target.splice(idx, 0, rowKey);

  return next;
}

/** @deprecated */
export function partitionToRowOrders(partition: ScheduleRowPartition): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [tabId, keys] of Object.entries(partition)) {
    out[tabId] = [...keys];
  }
  return out;
}

export type PartitionValidationResult =
  | { ok: true; partition: ScheduleDayAreaPartition }
  | { ok: false; message: string };

/** day×area partition 内の全行キーをフラット化（重複はそのまま列挙） */
export function flattenDayAreaPartitionKeys(partition: ScheduleDayAreaPartition): string[] {
  const keys: string[] = [];
  for (const tabMap of Object.values(partition)) {
    for (const rowKeys of Object.values(tabMap)) {
      keys.push(...rowKeys);
    }
  }
  return keys;
}

/** クライアント送信 partition の検証・正規化 */
export function validateClientDayAreaPartition(
  input: unknown,
  options: {
    tabIds: readonly string[];
    competitionDayKeys: readonly string[];
    expectedKeys: readonly string[];
  }
): PartitionValidationResult {
  const { tabIds, competitionDayKeys, expectedKeys } = options;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "partitionByDay の形式が不正です" };
  }

  const tabIdSet = new Set(tabIds);
  const dayKeySet = new Set(competitionDayKeys);
  const expectedSet = new Set(expectedKeys);
  const seen = new Set<string>();
  const partition: ScheduleDayAreaPartition = {};

  for (const [dayKey, tabMapRaw] of Object.entries(input as Record<string, unknown>)) {
    if (!dayKeySet.has(dayKey)) {
      return { ok: false, message: `不明な開催日です: ${dayKey}` };
    }
    if (tabMapRaw === null || typeof tabMapRaw !== "object" || Array.isArray(tabMapRaw)) {
      return { ok: false, message: `日 ${dayKey} のタブ割当形式が不正です` };
    }
    partition[dayKey] = {};
    for (const [tabId, keysRaw] of Object.entries(tabMapRaw as Record<string, unknown>)) {
      if (!tabIdSet.has(tabId)) {
        return { ok: false, message: `不明なエリアです: ${tabId}` };
      }
      if (!Array.isArray(keysRaw)) {
        return { ok: false, message: `行キー配列の形式が不正です (${dayKey}/${tabId})` };
      }
      const keys: string[] = [];
      for (const key of keysRaw) {
        if (typeof key !== "string" || !parseScheduleRowKey(key)) {
          return { ok: false, message: `行キーの形式が不正です: ${String(key)}` };
        }
        if (seen.has(key)) {
          return { ok: false, message: `行キーが重複しています: ${key}` };
        }
        seen.add(key);
        keys.push(key);
      }
      if (keys.length > 0) {
        partition[dayKey]![tabId] = keys;
      }
    }
  }

  if (seen.size !== expectedSet.size) {
    return {
      ok: false,
      message: "行キーの集合が大会の種目×ラウンドと一致しません",
    };
  }
  for (const key of expectedSet) {
    if (!seen.has(key)) {
      return {
        ok: false,
        message: "行キーの集合が大会の種目×ラウンドと一致しません",
      };
    }
  }

  return { ok: true, partition };
}

export type PublicScheduleAreaSection<T> = {
  tabId: string;
  tabName: string;
  rowKeys: string[];
};

export type PublicScheduleDaySection = {
  dayKey: string;
  dayLabel: string;
  areas: PublicScheduleAreaSection<unknown>[];
  isEmpty: boolean;
};

/** 公開用: 日 → エリア → 行（未割当・空エリア除外） */
export function buildPublicScheduleSections(input: {
  partition: ScheduleDayAreaPartition;
  competitionDays: readonly { key: string; label: string }[];
  tabs: readonly { id: string; name: string; displayOrder: number }[];
}): PublicScheduleDaySection[] {
  const { partition, competitionDays, tabs } = input;
  const sortedTabs = [...tabs].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));

  return competitionDays.map((day) => {
    const tabMap = partition[day.key] ?? {};
    const areas: PublicScheduleAreaSection<unknown>[] = [];
    for (const tab of sortedTabs) {
      const rowKeys = tabMap[tab.id] ?? [];
      if (rowKeys.length === 0) continue;
      areas.push({ tabId: tab.id, tabName: tab.name, rowKeys: [...rowKeys] });
    }
    return {
      dayKey: day.key,
      dayLabel: day.label,
      areas,
      isEmpty: areas.length === 0,
    };
  });
}
