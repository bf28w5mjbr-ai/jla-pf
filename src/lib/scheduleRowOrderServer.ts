import { prisma } from "@/server/db";
import {
  enumerateCompetitionScheduleDays,
  firstCompetitionScheduleDayKey,
} from "@/lib/competitionScheduleDays";
import { parseScheduleRoundCountDraft } from "@/lib/competitionScheduleTabDisplay";
import {
  buildScheduleDayAreaPartition,
  deriveEventPrimaryTabIdFromPartition,
  deriveEventSortOrderFromDayAreaPartition,
  partitionByDayToByTab,
  parseScheduleRowOrderByDayJson,
  SCHEDULE_ROW_UNASSIGNED_DAY_KEY,
  tabScheduleRowOrderJsonEqual,
  type ScheduleDayAreaPartition,
  type ScheduleRowOrderByDay,
} from "@/lib/scheduleRowOrder";

export type PersistPartitionOptions = {
  /** デフォルト true。振分 partition PUT では false */
  syncEventSortOrder?: boolean;
  /** デフォルト false。振分 partition PUT では true */
  syncEventTabId?: boolean;
  /** デフォルト false。JSON 同一タブは UPDATE しない */
  skipUnchangedTabs?: boolean;
  /** skipUnchangedTabs 用: tabId → DB 上の scheduleRowOrder */
  currentTabRowOrders?: Record<string, unknown>;
};

function roundCountFromEvent(startListRoundCount: number | null | undefined): number {
  return parseScheduleRoundCountDraft(undefined, startListRoundCount ?? 1);
}

function isLegacyOrNullRowOrder(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  return Array.isArray(raw);
}

export async function loadScheduleRowPartitionForCompetition(competitionId: string): Promise<{
  tabs: Array<{ id: string; name: string; displayOrder: number; scheduleRowOrder: unknown }>;
  events: Array<{
    id: string;
    scheduleTabId: string | null;
    startListRoundCount: number | null;
    scheduleTabSortOrder?: number | null;
  }>;
  partitionByDay: ScheduleDayAreaPartition;
  competitionDayKeys: string[];
  defaultDayKey: string;
}> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { startDate: true, endDate: true },
  });
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  const competitionDays = enumerateCompetitionScheduleDays(
    competition.startDate,
    competition.endDate
  );
  const competitionDayKeys = competitionDays.map((d) => d.key);
  const defaultDayKey = firstCompetitionScheduleDayKey(
    competition.startDate,
    competition.endDate
  );

  const tabs = await prisma.competitionScheduleTab.findMany({
    where: { competitionId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, displayOrder: true, scheduleRowOrder: true },
  });

  const events = await prisma.event.findMany({
    where: { competitionId },
    select: {
      id: true,
      scheduleTabId: true,
      startListRoundCount: true,
      scheduleTabSortOrder: true,
    },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  });

  const roundCountByEventId: Record<string, number> = {};
  for (const ev of events) {
    roundCountByEventId[ev.id] = roundCountFromEvent(ev.startListRoundCount);
  }

  const partitionByDay = buildScheduleDayAreaPartition({
    tabs,
    events,
    roundCountByEventId,
    competitionDayKeys,
    defaultDayKey,
  });

  return { tabs, events, partitionByDay, competitionDayKeys, defaultDayKey };
}

/** 振分 partition PUT 用の軽量読み込み（partition 再構築なし） */
export async function loadPartitionSaveContextForCompetition(competitionId: string): Promise<{
  tabs: Array<{ id: string; scheduleRowOrder: unknown }>;
  events: Array<{
    id: string;
    scheduleTabId: string | null;
    startListRoundCount: number | null;
  }>;
  competitionDayKeys: string[];
}> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { startDate: true, endDate: true },
  });
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  const competitionDays = enumerateCompetitionScheduleDays(
    competition.startDate,
    competition.endDate
  );
  const competitionDayKeys = competitionDays.map((d) => d.key);

  const [tabs, events] = await Promise.all([
    prisma.competitionScheduleTab.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, scheduleRowOrder: true },
    }),
    prisma.event.findMany({
      where: { competitionId },
      select: { id: true, scheduleTabId: true, startListRoundCount: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  return { tabs, events, competitionDayKeys };
}

export async function persistScheduleDayAreaPartition(
  partitionByDay: ScheduleDayAreaPartition,
  tabIds: readonly string[],
  events: Array<{
    id: string;
    scheduleTabSortOrder?: number | null;
    scheduleTabId?: string | null;
  }>,
  dayKeysInOrder: readonly string[],
  options: PersistPartitionOptions = {}
): Promise<void> {
  const {
    syncEventSortOrder = true,
    syncEventTabId = false,
    skipUnchangedTabs = false,
    currentTabRowOrders = {},
  } = options;

  const byTab = partitionByDayToByTab(partitionByDay, tabIds);
  const eventSortGlobal = syncEventSortOrder
    ? deriveEventSortOrderFromDayAreaPartition(partitionByDay, dayKeysInOrder)
    : null;

  const ops = [
    ...tabIds.flatMap((tabId) => {
      const nextOrder = byTab[tabId] ?? {};
      if (skipUnchangedTabs) {
        const currentParsed =
          parseScheduleRowOrderByDayJson(currentTabRowOrders[tabId]) ?? {};
        if (tabScheduleRowOrderJsonEqual(nextOrder, currentParsed)) {
          return [];
        }
      }
      return [
        prisma.competitionScheduleTab.update({
          where: { id: tabId },
          data: { scheduleRowOrder: nextOrder },
        }),
      ];
    }),
    ...events.flatMap((ev) => {
      const data: {
        scheduleTabId?: string;
        scheduleTabSortOrder?: number;
      } = {};

      if (syncEventTabId) {
        const primaryTabId = deriveEventPrimaryTabIdFromPartition(
          partitionByDay,
          ev.id,
          tabIds
        );
        if (primaryTabId && ev.scheduleTabId !== primaryTabId) {
          data.scheduleTabId = primaryTabId;
        }
      }

      if (eventSortGlobal) {
        const sortOrder = eventSortGlobal.get(ev.id);
        if (sortOrder !== undefined && ev.scheduleTabSortOrder !== sortOrder) {
          data.scheduleTabSortOrder = sortOrder;
        }
      }

      if (Object.keys(data).length === 0) return [];

      return [
        prisma.event.update({
          where: { id: ev.id },
          data,
        }),
      ];
    }),
  ];

  if (ops.length === 0) return;

  await prisma.$transaction(ops);
}

/** @deprecated alias */
export async function persistScheduleRowPartition(
  partition: ScheduleDayAreaPartition,
  events: Array<{ id: string }>,
  tabIds: readonly string[],
  dayKeysInOrder: readonly string[]
): Promise<void> {
  return persistScheduleDayAreaPartition(partition, tabIds, events, dayKeysInOrder);
}

/** 単一タブ・単一日の行順更新（キー集合は変えず順序のみ） */
export async function persistTabRowOrderInPartition(
  competitionId: string,
  tabId: string,
  dayKey: string,
  orderedRowKeys: string[]
): Promise<void> {
  const { events, partitionByDay, tabs, competitionDayKeys } =
    await loadScheduleRowPartitionForCompetition(competitionId);
  const currentKeys = partitionByDay[dayKey]?.[tabId] ?? [];
  const currentSet = new Set(currentKeys);
  if (
    orderedRowKeys.length !== currentSet.size ||
    orderedRowKeys.some((k) => !currentSet.has(k))
  ) {
    throw new Error("ROW_ORDER_MISMATCH");
  }
  if (!partitionByDay[dayKey]) {
    throw new Error("ROW_ORDER_MISMATCH");
  }
  partitionByDay[dayKey]![tabId] = orderedRowKeys;
  await persistScheduleDayAreaPartition(
    partitionByDay,
    tabs.map((t) => t.id),
    events,
    competitionDayKeys
  );
}

function hasUnassignedBucket(raw: unknown): boolean {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return SCHEDULE_ROW_UNASSIGNED_DAY_KEY in (raw as Record<string, unknown>);
}

export function scheduleRowOrderNeedsMigration(
  tabs: Array<{ scheduleRowOrder: unknown }>
): boolean {
  return tabs.some(
    (t) => isLegacyOrNullRowOrder(t.scheduleRowOrder) || hasUnassignedBucket(t.scheduleRowOrder)
  );
}

export function normalizeTabRowOrdersForPersist(
  byTab: Record<string, ScheduleRowOrderByDay>
): Record<string, ScheduleRowOrderByDay> {
  const out: Record<string, ScheduleRowOrderByDay> = {};
  for (const [tabId, raw] of Object.entries(byTab)) {
    const parsed = parseScheduleRowOrderByDayJson(raw);
    out[tabId] = parsed ?? {};
  }
  return out;
}

export { deriveEventSortOrderFromRowOrder } from "@/lib/scheduleRowOrder";
