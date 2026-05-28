"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateForDatetimeLocalInput } from "@/lib/datetimeLocal";
import {
  competitionScheduleDatetimeLocalMinMax,
  isInstantWithinCompetitionEventSchedule,
} from "@/lib/eventScheduleWithinCompetition";
import { effectiveRoundStartIso, roundStartKey } from "@/lib/eventRoundScheduledStarts";
import {
  buildScheduleRoundRowsFromKeys,
  buildScheduleTabListItems,
  parseScheduleRoundCountDraft,
  type CompetitionScheduleTabLite,
  type ScheduleRoundRow,
} from "@/lib/competitionScheduleTabDisplay";
import {
  buildStartListAgeCategoryTabs,
  filterEventsByStartListAgeCategory,
} from "@/lib/startListAgeCategoryTabs";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { serverEventsSyncKeyFromSorted } from "@/lib/startListEventBarServerSyncKey";
import {
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";
import { useStartListRoundHeatDrafts } from "@/hooks/useStartListRoundHeatDrafts";
import { StartListRoundSettingsCard } from "@/components/StartListRoundSettingsCard";
import { StartListScheduleCard } from "@/components/StartListScheduleCard";

import {
  buildScheduleDayAreaPartition,
  buildPublicScheduleSections,
  findDayTabForRowKey,
  formatScheduleRowKey,
  moveRowKeyInDayAreaPartition,
  partitionsDeepEqual,
  rowOrderByTabForDay,
  roundCountForEvent,
  type ScheduleDayAreaPartition,
} from "@/lib/scheduleRowOrder";
import {
  enumerateCompetitionScheduleDays,
  firstCompetitionScheduleDayKey,
  dayKeyFromInstant,
} from "@/lib/competitionScheduleDays";
import {
  compareStartListEvents,
  sortRowsByStartTimeOrder,
} from "@/lib/startListScheduleUtils";

export type { StartListEventBarItem } from "@/lib/startListEventBarTypes";

type Props = {
  competitionId: string;
  competitionName?: string;
  competitionStartDate: Date | string;
  competitionEndDate: Date | string;
  scheduleTabs: CompetitionScheduleTabLite[];
  events: StartListEventBarItem[];
  initialStartListSettings?: unknown;
  canReorder: boolean;
  canEditSchedule?: boolean;
  canEditRoundCount?: boolean;
};

type SchedulePatchResponseEvent = {
  id: string;
  scheduledStartAt: string | null;
  startListRoundCount?: number;
  roundScheduledStarts?: unknown;
};

function roundStartsDraftFromBarItems(events: readonly StartListEventBarItem[]): Record<string, string> {
  const rs: Record<string, string> = {};
  for (const e of events) {
    const n =
      typeof e.startListRoundCount === "number" && e.startListRoundCount >= 1
        ? Math.min(32, e.startListRoundCount)
        : 1;
    for (let ri = 0; ri < n; ri += 1) {
      const iso = effectiveRoundStartIso({
        scheduledStartAt: e.scheduledStartAt,
        roundScheduledStarts: e.roundScheduledStarts,
        roundIndex: ri,
      });
      rs[roundStartKey(e.id, ri)] = iso ? formatDateForDatetimeLocalInput(new Date(iso)) : "";
    }
  }
  return rs;
}

function applyScheduleEventsPatchToOrder(
  prev: StartListEventBarItem[],
  apiEvents: SchedulePatchResponseEvent[]
): StartListEventBarItem[] {
  const byId = new Map(apiEvents.map((ev) => [ev.id, ev]));
  return prev.map((row) => {
    const up = byId.get(row.id);
    if (!up) return row;
    return {
      ...row,
      scheduledStartAt: up.scheduledStartAt,
      roundScheduledStarts: up.roundScheduledStarts ?? row.roundScheduledStarts,
      startListRoundCount:
        typeof up.startListRoundCount === "number" ? up.startListRoundCount : row.startListRoundCount,
    };
  });
}

function computeServerDayAreaPartition(
  scheduleTabs: readonly CompetitionScheduleTabLite[],
  order: readonly StartListEventBarItem[],
  roundCounts: Record<string, string>,
  parseRoundCountDraft: (raw: string | undefined, fallback: number) => number,
  competitionDayKeys: readonly string[],
  defaultDayKey: string
): ScheduleDayAreaPartition {
  const roundCountByEventId: Record<string, number> = {};
  for (const ev of order) {
    roundCountByEventId[ev.id] = roundCountForEvent(ev, roundCounts, parseRoundCountDraft);
  }
  return buildScheduleDayAreaPartition({
    tabs: scheduleTabs.map((t) => ({
      id: t.id,
      scheduleRowOrder: t.scheduleRowOrder ?? null,
    })),
    events: order,
    roundCountByEventId,
    competitionDayKeys,
    defaultDayKey,
  });
}

export default function StartListEventIndexBars({
  competitionId,
  competitionName,
  competitionStartDate,
  competitionEndDate,
  scheduleTabs,
  events,
  initialStartListSettings,
  canReorder,
  canEditSchedule = false,
  canEditRoundCount = false,
}: Props) {
  const router = useRouter();
  const compStart = useMemo(() => new Date(competitionStartDate), [competitionStartDate]);
  const compEnd = useMemo(() => new Date(competitionEndDate), [competitionEndDate]);
  const competitionDays = useMemo(
    () => enumerateCompetitionScheduleDays(compStart, compEnd),
    [compStart, compEnd]
  );
  const competitionDayKeys = useMemo(
    () => competitionDays.map((d) => d.key),
    [competitionDays]
  );
  const defaultDayKey = useMemo(
    () => firstCompetitionScheduleDayKey(compStart, compEnd),
    [compStart, compEnd]
  );
  const scheduleDayTabs = competitionDays;
  const scheduleMinMax = useMemo(
    () => competitionScheduleDatetimeLocalMinMax(compStart, compEnd),
    [compStart, compEnd]
  );
  const [order, setOrder] = useState<StartListEventBarItem[]>(() => [...events].sort(compareStartListEvents));
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [roundStarts, setRoundStarts] = useState<Record<string, string>>({});
  const [timeSavingId, setTimeSavingId] = useState<string | null>(null);
  const [staggerBase, setStaggerBase] = useState("");
  const [staggerMinutes, setStaggerMinutes] = useState("15");
  const [bulkApplying, setBulkApplying] = useState(false);
  /** ラウンド設定カードの年齢（未分類）タブ */
  const [activeRoundSettingsAgeTab, setActiveRoundSettingsAgeTab] = useState<string>("");
  /** タイムスケジュールで表示・並べ替え対象にする開催日 */
  const [activeScheduleDayKey, setActiveScheduleDayKey] = useState<string>("");
  /** タイムスケジュールで表示・並べ替え対象にするエリア（スケジュールタブ） */
  const [activeAreaTabId, setActiveAreaTabId] = useState<string>("");
  const [newTabNameDraft, setNewTabNameDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetTabId, setDeleteTargetTabId] = useState<string | null>(null);
  const [deleteMigrateToTabId, setDeleteMigrateToTabId] = useState<string>("");
  const [tabMutationSaving, setTabMutationSaving] = useState(false);
  const [rowOrderByDayAndTab, setRowOrderByDayAndTab] = useState<ScheduleDayAreaPartition>({});
  const [assignDirty, setAssignDirty] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const savedPartitionRef = useRef<ScheduleDayAreaPartition>({});
  const lastAssignSaveSyncKeyRef = useRef<string | null>(null);
  const assignStateRef = useRef({
    partition: {} as ScheduleDayAreaPartition,
    dirty: false,
    competitionId,
  });
  const savedRoundStartsRef = useRef<Record<string, string>>({});

  const { sortedFromServer, serverSyncKey } = useMemo(() => {
    const sorted = [...events].sort(compareStartListEvents);
    return {
      sortedFromServer: sorted,
      serverSyncKey: serverEventsSyncKeyFromSorted(sorted),
    };
  }, [events]);

  const roundHeatDraft = useStartListRoundHeatDrafts({
    competitionId,
    mergeOrderedBarItems: order,
    roundCountResetBarItems: sortedFromServer,
    initialStartListSettings: initialStartListSettings ?? null,
    serverSyncKey,
    syncHeatDraftsFromSettings: canEditRoundCount,
  });
  const {
    roundCounts,
    bulkSaving: roundSetupBulkSaving,
    heatDraftByEvent,
  } = roundHeatDraft;
  const parseRoundCountDraft = parseScheduleRoundCountDraft;

  const heatDraftSyncKey = useMemo(() => {
    const s =
      initialStartListSettings && typeof initialStartListSettings === "object"
        ? JSON.stringify(initialStartListSettings)
        : "";
    return `${serverSyncKey}|${s}`;
  }, [serverSyncKey, initialStartListSettings]);

  useEffect(() => {
    setOrder(sortedFromServer);
    const rs = roundStartsDraftFromBarItems(sortedFromServer);
    setRoundStarts(rs);
    savedRoundStartsRef.current = rs;
    // 配列参照を依存にすると React 19 で依存配列の長さが種目数に連動することがあるため、文字列キーのみ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverSyncKey に表示順・開始時刻の実体が含まれる
  }, [serverSyncKey]);

  const rowOrderSyncKey = useMemo(() => {
    const tabPart = scheduleTabs
      .map((t) => `${t.id}:${JSON.stringify(t.scheduleRowOrder ?? null)}`)
      .join("|");
    return `${serverSyncKey}|${tabPart}|${JSON.stringify(roundCounts)}`;
  }, [scheduleTabs, serverSyncKey, roundCounts]);

  useEffect(() => {
    if (assignDirty) return;
    if (
      lastAssignSaveSyncKeyRef.current === rowOrderSyncKey &&
      partitionsDeepEqual(rowOrderByDayAndTab, savedPartitionRef.current)
    ) {
      return;
    }
    const serverPartition = computeServerDayAreaPartition(
      scheduleTabs,
      sortedFromServer,
      roundCounts,
      parseRoundCountDraft,
      competitionDayKeys,
      defaultDayKey
    );
    setRowOrderByDayAndTab(serverPartition);
    savedPartitionRef.current = JSON.parse(
      JSON.stringify(serverPartition)
    ) as ScheduleDayAreaPartition;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowOrderSyncKey に実体が含まれる
  }, [rowOrderSyncKey, assignDirty]);

  useEffect(() => {
    assignStateRef.current = {
      partition: rowOrderByDayAndTab,
      dirty: assignDirty,
      competitionId,
    };
  }, [rowOrderByDayAndTab, assignDirty, competitionId]);

  const tabIds = useMemo(() => scheduleTabs.map((t) => t.id), [scheduleTabs]);

  const resolvedActiveScheduleDayKey = useMemo(() => {
    if (
      activeScheduleDayKey &&
      scheduleDayTabs.some((d) => d.key === activeScheduleDayKey)
    ) {
      return activeScheduleDayKey;
    }
    return scheduleDayTabs[0]?.key ?? defaultDayKey;
  }, [activeScheduleDayKey, scheduleDayTabs, defaultDayKey]);

  useEffect(() => {
    const first = scheduleDayTabs[0]?.key ?? defaultDayKey;
    if (!first) return;
    if (
      !activeScheduleDayKey ||
      !scheduleDayTabs.some((d) => d.key === activeScheduleDayKey)
    ) {
      setActiveScheduleDayKey(first);
    }
  }, [activeScheduleDayKey, scheduleDayTabs, defaultDayKey]);

  const rowOrderByTabId = useMemo(
    () => rowOrderByTabForDay(rowOrderByDayAndTab, resolvedActiveScheduleDayKey, tabIds),
    [rowOrderByDayAndTab, resolvedActiveScheduleDayKey, tabIds]
  );

  const scheduleTabBarItems = useMemo(
    () => buildScheduleTabListItems(scheduleTabs, rowOrderByTabId),
    [scheduleTabs, rowOrderByTabId]
  );

  const ageCategoryTabsForRoundSettings = useMemo(
    () => buildStartListAgeCategoryTabs(order),
    [order]
  );

  const resolvedRoundSettingsAgeTab = useMemo(() => {
    if (
      activeRoundSettingsAgeTab &&
      ageCategoryTabsForRoundSettings.some((t) => t.key === activeRoundSettingsAgeTab)
    ) {
      return activeRoundSettingsAgeTab;
    }
    return ageCategoryTabsForRoundSettings[0]?.key ?? "";
  }, [activeRoundSettingsAgeTab, ageCategoryTabsForRoundSettings]);

  useEffect(() => {
    const first = ageCategoryTabsForRoundSettings[0]?.key ?? "";
    if (!first) return;
    if (
      !activeRoundSettingsAgeTab ||
      !ageCategoryTabsForRoundSettings.some((t) => t.key === activeRoundSettingsAgeTab)
    ) {
      setActiveRoundSettingsAgeTab(first);
    }
  }, [activeRoundSettingsAgeTab, ageCategoryTabsForRoundSettings]);

  const resolvedActiveAreaTabId = useMemo(() => {
    if (activeAreaTabId && scheduleTabs.some((t) => t.id === activeAreaTabId)) {
      return activeAreaTabId;
    }
    return scheduleTabs[0]?.id ?? "";
  }, [activeAreaTabId, scheduleTabs]);

  const heatSettingForExpandedRow = useCallback(
    (eventId: string): HeatSetting => {
      const baseline = parseStartListSettings(initialStartListSettings ?? null);
      return {
        ...(baseline.eventSettings[eventId] ?? {}),
        ...(heatDraftByEvent[eventId] ?? {}),
      };
    },
    [initialStartListSettings, heatDraftByEvent]
  );

  const visibleRoundRows = useMemo(() => {
    const keys = rowOrderByTabId[resolvedActiveAreaTabId] ?? [];
    return buildScheduleRoundRowsFromKeys(
      keys,
      order,
      roundCounts,
      (eventId) => heatSettingForExpandedRow(eventId),
      parseRoundCountDraft
    );
  }, [
    rowOrderByTabId,
    resolvedActiveAreaTabId,
    order,
    roundCounts,
    heatSettingForExpandedRow,
    parseRoundCountDraft,
  ]);

  const rowsByTabId = useMemo(() => {
    const result: Record<string, ScheduleRoundRow<StartListEventBarItem>[]> = {};
    for (const tab of scheduleTabs) {
      const keys = rowOrderByTabId[tab.id] ?? [];
      result[tab.id] = buildScheduleRoundRowsFromKeys(
        keys,
        order,
        roundCounts,
        (eventId) => heatSettingForExpandedRow(eventId),
        parseRoundCountDraft
      );
    }
    return result;
  }, [scheduleTabs, rowOrderByTabId, order, roundCounts, heatSettingForExpandedRow, parseRoundCountDraft]);

  const rowsByTabIdAndDay = useMemo(() => {
    const result: Record<string, Record<string, ScheduleRoundRow<StartListEventBarItem>[]>> = {};
    for (const tab of scheduleTabs) {
      result[tab.id] = {};
      for (const day of competitionDays) {
        const keys = rowOrderByDayAndTab[day.key]?.[tab.id] ?? [];
        result[tab.id]![day.key] = buildScheduleRoundRowsFromKeys(
          keys,
          order,
          roundCounts,
          (eventId) => heatSettingForExpandedRow(eventId),
          parseRoundCountDraft
        );
      }
    }
    return result;
  }, [
    scheduleTabs,
    competitionDays,
    rowOrderByDayAndTab,
    order,
    roundCounts,
    heatSettingForExpandedRow,
    parseRoundCountDraft,
  ]);

  useEffect(() => {
    const first = scheduleTabs[0]?.id ?? "";
    if (!first) return;
    if (!activeAreaTabId || !scheduleTabs.some((t) => t.id === activeAreaTabId)) {
      setActiveAreaTabId(first);
    }
  }, [activeAreaTabId, scheduleTabs]);

  const persistTabRowOrder = async (
    tabId: string,
    dayKey: string,
    orderedRowKeys: string[],
    successMessage?: string
  ) => {
    if (!tabId || !dayKey) return;
    setReorderSaving(true);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/schedule-tabs/${encodeURIComponent(tabId)}/rows/order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedRowKeys, dayKey }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "並べ替えの保存に失敗しました");
      toast.success(successMessage ?? "表示順を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "並べ替えの保存に失敗しました");
      setRowOrderByDayAndTab(
        computeServerDayAreaPartition(
          scheduleTabs,
          sortedFromServer,
          roundCounts,
          parseRoundCountDraft,
          competitionDayKeys,
          defaultDayKey
        )
      );
    } finally {
      setReorderSaving(false);
    }
  };

  const saveAssignPartition = useCallback(
    async (options?: {
      silent?: boolean;
      keepalive?: boolean;
      partition?: ScheduleDayAreaPartition;
    }): Promise<boolean> => {
      const partition = options?.partition ?? assignStateRef.current.partition;
      if (!assignStateRef.current.dirty && !options?.partition) {
        return true;
      }
      if (assignSaving && !options?.keepalive) {
        return false;
      }

      if (!options?.keepalive) {
        setAssignSaving(true);
      }

      try {
        const res = await fetch(
          `/api/competitions/${competitionId}/schedule-tabs/partition`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partitionByDay: partition }),
            keepalive: options?.keepalive ?? false,
          }
        );
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message || "振分の保存に失敗しました");
        }

        const saved = JSON.parse(JSON.stringify(partition)) as ScheduleDayAreaPartition;
        savedPartitionRef.current = saved;
        if (!options?.keepalive) {
          lastAssignSaveSyncKeyRef.current = rowOrderSyncKey;
          setAssignDirty(false);
          setRowOrderByDayAndTab(saved);
          if (!options?.silent) {
            toast.success(data.message || "振分を保存しました");
          }
        } else if (!options?.silent) {
          toast.success(data.message || "振分を保存しました");
        }
        return true;
      } catch (e) {
        if (!options?.silent && !options?.keepalive) {
          toast.error(e instanceof Error ? e.message : "振分の保存に失敗しました");
        }
        return false;
      } finally {
        if (!options?.keepalive) {
          setAssignSaving(false);
        }
      }
    },
    [assignSaving, competitionId, rowOrderSyncKey]
  );

  const discardAssignPartition = useCallback(() => {
    const snapshot = savedPartitionRef.current;
    setRowOrderByDayAndTab(JSON.parse(JSON.stringify(snapshot)) as ScheduleDayAreaPartition);
    setAssignDirty(false);
    lastAssignSaveSyncKeyRef.current = rowOrderSyncKey;
    setDragId(null);
  }, [rowOrderSyncKey]);

  const onBeforeLeaveAssignMode = useCallback(async () => {
    if (!assignDirty) return true;
    return saveAssignPartition({ silent: true });
  }, [assignDirty, saveAssignPartition]);

  useEffect(() => {
    const saveOnLeave = () => {
      const { partition, dirty } = assignStateRef.current;
      if (!dirty) return;
      void saveAssignPartition({
        silent: true,
        keepalive: true,
        partition,
      });
    };
    const onPageHide = () => saveOnLeave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      saveOnLeave();
    };
  }, [saveAssignPartition]);

  const handleAssignDropOn = (tabId: string, dayKey: string, targetRowKey: string | null) => {
    if (!canReorder || !dragId || assignSaving) {
      setDragId(null);
      return;
    }
    if (targetRowKey && dragId === targetRowKey) {
      setDragId(null);
      return;
    }
    const keys = rowOrderByDayAndTab[dayKey]?.[tabId] ?? [];
    let insertIndex: number | undefined;
    if (targetRowKey) {
      const ti = keys.indexOf(targetRowKey);
      if (ti < 0) {
        setDragId(null);
        return;
      }
      insertIndex = ti;
    }
    const next = moveRowKeyInDayAreaPartition(
      rowOrderByDayAndTab,
      dragId,
      dayKey,
      tabId,
      tabIds,
      insertIndex
    );
    setDragId(null);
    if (next) {
      setRowOrderByDayAndTab(next);
      setAssignDirty(true);
    }
  };

  const addScheduleTab = async () => {
    const name = newTabNameDraft.trim();
    if (!name) {
      toast.error("エリア名を入力してください");
      return;
    }
    if (assignDirty) {
      const saved = await saveAssignPartition({ silent: true });
      if (!saved) return;
    }
    setTabMutationSaving(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/schedule-tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        tab?: { id: string };
      };
      if (!res.ok) throw new Error(data.message || "エリアの追加に失敗しました");
      toast.success(data.message || "エリアを追加しました");
      setNewTabNameDraft("");
      if (data.tab?.id) setActiveAreaTabId(data.tab.id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エリアの追加に失敗しました");
    } finally {
      setTabMutationSaving(false);
    }
  };

  const submitDeleteTab = async () => {
    if (!deleteTargetTabId) return;
    if (assignDirty) {
      const saved = await saveAssignPartition({ silent: true });
      if (!saved) return;
    }
    const rowsInTab = Object.values(rowOrderByDayAndTab).reduce(
      (sum, tabMap) => sum + (tabMap[deleteTargetTabId]?.length ?? 0),
      0
    );
    if (rowsInTab > 0 && !deleteMigrateToTabId.trim()) {
      toast.error("行を移す先のエリアを選んでください");
      return;
    }
    setTabMutationSaving(true);
    try {
      const qs =
        rowsInTab > 0
          ? `?migrateToTabId=${encodeURIComponent(deleteMigrateToTabId.trim())}`
          : "";
      const res = await fetch(
        `/api/competitions/${competitionId}/schedule-tabs/${encodeURIComponent(deleteTargetTabId)}${qs}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "エリアの削除に失敗しました");
      toast.success(data.message || "エリアを削除しました");
      setDeleteOpen(false);
      setActiveAreaTabId((cur) => (cur === deleteTargetTabId ? scheduleTabs[0]?.id ?? "" : cur));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エリアの削除に失敗しました");
    } finally {
      setTabMutationSaving(false);
    }
  };

  const saveRoundStart = async (eventId: string, roundIndex: number, options?: { silent?: boolean }) => {
    const rk = roundStartKey(eventId, roundIndex);
    const raw = roundStarts[rk] ?? "";
    if (raw.trim() !== "") {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        if (!options?.silent) toast.error("日時の形式が不正です");
        return false;
      }
      if (!isInstantWithinCompetitionEventSchedule(parsed, compStart, compEnd)) {
        if (!options?.silent) toast.error("開始日時は大会の開催期間内にしてください");
        return false;
      }
    }
    if (raw.trim() === (savedRoundStartsRef.current[rk] ?? "").trim()) {
      return true;
    }
    setTimeSavingId(`${eventId}:${roundIndex}`);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleRoundIndex: roundIndex,
            scheduledStartAt: raw.trim() === "" ? null : raw,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        events?: SchedulePatchResponseEvent[];
      };
      if (!res.ok) throw new Error(data.message || "開始時刻の保存に失敗しました");

      const apiEvents = data.events;
      let mergedRoundStarts = roundStarts;
      let mergedOrder = order;

      if (apiEvents?.length) {
        mergedOrder = applyScheduleEventsPatchToOrder(order, apiEvents);
        setOrder(mergedOrder);
        const byId = new Map(apiEvents.map((ev) => [ev.id, ev]));
        const u = byId.get(eventId);
        if (u) {
          mergedRoundStarts = { ...roundStarts };
          const nRounds =
            typeof u.startListRoundCount === "number" && u.startListRoundCount >= 1
              ? Math.min(32, u.startListRoundCount)
              : 1;
          for (let ri = 0; ri < nRounds; ri += 1) {
            const iso = effectiveRoundStartIso({
              scheduledStartAt: u.scheduledStartAt,
              roundScheduledStarts: u.roundScheduledStarts,
              roundIndex: ri,
            });
            mergedRoundStarts[roundStartKey(eventId, ri)] = iso
              ? formatDateForDatetimeLocalInput(new Date(iso))
              : "";
          }
          setRoundStarts(mergedRoundStarts);
          savedRoundStartsRef.current = mergedRoundStarts;
        }
      }

      if (canReorder && apiEvents?.length) {
        const areaId = resolvedActiveAreaTabId;
        const dayKey = resolvedActiveScheduleDayKey;
        if (areaId && dayKey) {
          const currentKeys = rowOrderByTabId[areaId] ?? [];
          const expanded = buildScheduleRoundRowsFromKeys(
            currentKeys,
            mergedOrder,
            roundCounts,
            (id) => heatSettingForExpandedRow(id),
            parseRoundCountDraft
          );
          const sortedRows = sortRowsByStartTimeOrder(expanded, mergedRoundStarts);
          const nextKeys = sortedRows.map((r) => formatScheduleRowKey(r.event.id, r.roundIndex));
          if (nextKeys.join(",") !== currentKeys.join(",")) {
            setRowOrderByDayAndTab((prev) => {
              const next = { ...prev };
              const shell = { ...(next[dayKey] ?? {}) };
              shell[areaId] = nextKeys;
              next[dayKey] = shell;
              return next;
            });
            await persistTabRowOrder(
              areaId,
              dayKey,
              nextKeys,
              "開始時刻を保存し、時刻順に並べ替えました"
            );
            return true;
          }
        }
      }

      const rowKey = formatScheduleRowKey(eventId, roundIndex);
      const assigned = findDayTabForRowKey(rowKey, rowOrderByDayAndTab);
      if (raw.trim() !== "" && assigned) {
        const savedDayKey = dayKeyFromInstant(new Date(raw));
        if (savedDayKey && savedDayKey !== assigned.dayKey) {
          toast.warning(
            "開始時刻の日付と、振り分けた開催日が一致していません。割当は変更していません。"
          );
        }
      }

      if (!options?.silent) toast.success(data.message || "開始時刻を保存しました");
      router.refresh();
      return true;
    } catch (e) {
      if (!options?.silent) toast.error(e instanceof Error ? e.message : "開始時刻の保存に失敗しました");
      return false;
    } finally {
      setTimeSavingId(null);
    }
  };

  const applyStaggerAndSave = async () => {
    const baseStr = staggerBase.trim();
    if (!baseStr) {
      toast.error("1件目の開始日時を入力してください");
      return;
    }
    const base = new Date(baseStr);
    if (Number.isNaN(base.getTime())) {
      toast.error("1件目の開始日時の形式が不正です");
      return;
    }
    const step = Number.parseInt(staggerMinutes, 10);
    if (!Number.isFinite(step) || step < 1 || step > 24 * 60) {
      toast.error("間隔は1〜1440分（24時間）以内で指定してください");
      return;
    }
    if (!isInstantWithinCompetitionEventSchedule(base, compStart, compEnd)) {
      toast.error("1件目の開始日時は大会の開催期間内にしてください");
      return;
    }

    const areaId = resolvedActiveAreaTabId;
    if (!areaId) {
      toast.error("表示中のエリアが未設定です");
      return;
    }
    if (visibleRoundRows.length === 0) {
      toast.error("このエリアに表示する種目がありません");
      return;
    }

    const slots: { eventId: string; roundIndex: number; at: Date }[] = [];
    for (let i = 0; i < visibleRoundRows.length; i++) {
      const row = visibleRoundRows[i]!;
      const at = new Date(base.getTime() + i * step * 60_000);
      if (!isInstantWithinCompetitionEventSchedule(at, compStart, compEnd)) {
        toast.error(
          `「${row.event.name ?? ""}（${row.roundLabel}）」の時刻が開催期間外になります（${i + 1}件目）。間隔または開始を見直してください。`
        );
        return;
      }
      slots.push({
        eventId: row.event.id,
        roundIndex: row.roundIndex,
        at,
      });
    }

    setBulkApplying(true);
    try {
      let mergedOrder = order;
      for (const slot of slots) {
        const payload = formatDateForDatetimeLocalInput(slot.at);
        const res = await fetch(
          `/api/competitions/${competitionId}/events/${encodeURIComponent(slot.eventId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduleRoundIndex: slot.roundIndex,
              scheduledStartAt: payload,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          events?: SchedulePatchResponseEvent[];
        };
        if (!res.ok) {
          throw new Error(data.message || "一括保存に失敗しました");
        }
        if (data.events?.length) {
          mergedOrder = applyScheduleEventsPatchToOrder(mergedOrder, data.events);
        }
      }

      const nextRoundStarts = roundStartsDraftFromBarItems(mergedOrder);
      setRoundStarts(nextRoundStarts);
      setOrder(mergedOrder);

      if (canReorder) {
        const currentKeys = visibleRoundRows.map((r) =>
          formatScheduleRowKey(r.event.id, r.roundIndex)
        );
        const expanded = buildScheduleRoundRowsFromKeys(
          currentKeys,
          mergedOrder,
          roundCounts,
          (id) => heatSettingForExpandedRow(id),
          parseRoundCountDraft
        );
        const sortedRows = sortRowsByStartTimeOrder(expanded, nextRoundStarts);
        const nextKeys = sortedRows.map((r) => formatScheduleRowKey(r.event.id, r.roundIndex));
        if (nextKeys.join(",") !== currentKeys.join(",")) {
          setRowOrderByDayAndTab((prev) => {
            const next = { ...prev };
            const shell = { ...(next[resolvedActiveScheduleDayKey] ?? {}) };
            shell[areaId] = nextKeys;
            next[resolvedActiveScheduleDayKey] = shell;
            return next;
          });
          await persistTabRowOrder(
            areaId,
            resolvedActiveScheduleDayKey,
            nextKeys,
            "一括で開始時刻を保存し、時刻順に並べ替えました"
          );
          return;
        }
      }

      toast.success("一括で開始時刻を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "一括保存に失敗しました");
    } finally {
      setBulkApplying(false);
    }
  };

  const handleDropOn = (targetRowKey: string) => {
    if (!canReorder || !dragId || dragId === targetRowKey) {
      setDragId(null);
      return;
    }
    const areaId = resolvedActiveAreaTabId;
    if (!areaId) {
      setDragId(null);
      return;
    }
    const currentKeys = visibleRoundRows.map((r) =>
      formatScheduleRowKey(r.event.id, r.roundIndex)
    );
    const fi = currentKeys.indexOf(dragId);
    const ti = currentKeys.indexOf(targetRowKey);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const nextKeys = [...currentKeys];
    const [item] = nextKeys.splice(fi, 1);
    nextKeys.splice(ti, 0, item!);
    setRowOrderByDayAndTab((prev) => {
      const next = { ...prev };
      const shell = { ...(next[resolvedActiveScheduleDayKey] ?? {}) };
      shell[areaId] = nextKeys;
      next[resolvedActiveScheduleDayKey] = shell;
      return next;
    });
    setDragId(null);
    void persistTabRowOrder(areaId, resolvedActiveScheduleDayKey, nextKeys);
  };

  const publicScheduleBarsOnly =
    !canReorder && !canEditSchedule && !canEditRoundCount;

  const splitRoundSettingsCard = canEditRoundCount;

  const hintRoundSettingsCard = (() => {
    if (publicScheduleBarsOnly) return "";
    return "ラウンド数・ヒート数・最大レーンを入力し、下部の「一括保存」で確定してください（初回保存時に当日運用向けの確定も記録されます）。種目のスタートリストは下の一覧から。";
  })();

  const hintAssignCard = (() => {
    if (publicScheduleBarsOnly) return "";
    return "エリア内の日付列へドラッグして配置。「保存」またはスケジュール切替で確定します。";
  })();

  const hintScheduleCard = (() => {
    if (publicScheduleBarsOnly) {
      return "開催日ごとにタイムスケジュールを表示しています。行をタップでスタートリストを表示します。";
    }
    const parts: string[] = [];
    if (canReorder) {
      parts.push("表示中の日・エリア内で各行（ラウンド）をドラッグして並べ替え（自動保存）");
    }
    parts.push("行をタップで詳細");
    if (canEditSchedule) {
      parts.push("時刻を保存すると自動で時刻順に並びます");
      parts.push("開始は開催期内・終了は種目ページ");
    }
    return parts.join(" · ");
  })();

  const publicScheduleViewSections = useMemo(() => {
    const raw = buildPublicScheduleSections({
      partition: rowOrderByDayAndTab,
      competitionDays,
      tabs: scheduleTabs,
    });
    return raw.map((section) => ({
      dayKey: section.dayKey,
      dayLabel: section.dayLabel,
      isEmpty: section.isEmpty,
      areas: section.areas.map((area) => ({
        tabId: area.tabId,
        tabName: area.tabName,
        rows: buildScheduleRoundRowsFromKeys(
          area.rowKeys,
          order,
          roundCounts,
          (eventId) => heatSettingForExpandedRow(eventId),
          parseRoundCountDraft
        ),
      })),
    }));
  }, [
    rowOrderByDayAndTab,
    competitionDays,
    scheduleTabs,
    order,
    roundCounts,
    heatSettingForExpandedRow,
    parseRoundCountDraft,
  ]);

  const tabRowCountsAllDays = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of scheduleTabs) counts[tab.id] = 0;
    for (const tabMap of Object.values(rowOrderByDayAndTab)) {
      for (const [tabId, keys] of Object.entries(tabMap)) {
        counts[tabId] = (counts[tabId] ?? 0) + keys.length;
      }
    }
    return counts;
  }, [rowOrderByDayAndTab, scheduleTabs]);

  if (order.length === 0) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
          <CardTitle className="text-sm font-semibold">タイムスケジュール</CardTitle>
          {competitionName ? (
            <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
          ) : null}
        </CardHeader>
        <CardContent className="px-2.5 py-2.5">
          <p className="text-xs text-muted-foreground">種目が登録されていません。</p>
        </CardContent>
      </Card>
    );
  }

  const roundSettingsCard = splitRoundSettingsCard ? (
    <StartListRoundSettingsCard
      competitionName={competitionName}
      events={order}
      draft={roundHeatDraft}
      hintText={hintRoundSettingsCard}
      canEditSchedule={canEditSchedule}
      ageCategoryTabs={ageCategoryTabsForRoundSettings}
      activeAgeCategoryTab={resolvedRoundSettingsAgeTab}
      onAgeCategoryTabChange={setActiveRoundSettingsAgeTab}
      extraHeatUiLocked={
        bulkApplying || timeSavingId !== null || reorderSaving || roundSetupBulkSaving
      }
    />
  ) : null;

  const scheduleCard = (
    <StartListScheduleCard
      competitionId={competitionId}
      competitionName={competitionName}
      hintAssignCard={hintAssignCard}
      hintScheduleCard={hintScheduleCard}
      canReorder={canReorder}
      canEditSchedule={canEditSchedule}
      publicScheduleBarsOnly={publicScheduleBarsOnly}
      publicScheduleSections={publicScheduleViewSections}
      scheduleDayTabs={scheduleDayTabs}
      competitionDays={competitionDays}
      resolvedActiveScheduleDayKey={resolvedActiveScheduleDayKey}
      setActiveScheduleDayKey={setActiveScheduleDayKey}
      scheduleTabs={scheduleTabs}
      scheduleTabBarItems={scheduleTabBarItems}
      tabRowCountsAllDays={tabRowCountsAllDays}
      resolvedActiveAreaTabId={resolvedActiveAreaTabId}
      setActiveAreaTabId={setActiveAreaTabId}
      newTabNameDraft={newTabNameDraft}
      setNewTabNameDraft={setNewTabNameDraft}
      tabMutationSaving={tabMutationSaving}
      reorderSaving={reorderSaving}
      bulkApplying={bulkApplying}
      timeSavingId={timeSavingId}
      roundSetupBulkSaving={roundSetupBulkSaving}
      addScheduleTab={addScheduleTab}
      setDeleteTargetTabId={setDeleteTargetTabId}
      setDeleteMigrateToTabId={setDeleteMigrateToTabId}
      setDeleteOpen={setDeleteOpen}
      scheduleMinMax={scheduleMinMax}
      staggerBase={staggerBase}
      setStaggerBase={setStaggerBase}
      staggerMinutes={staggerMinutes}
      setStaggerMinutes={setStaggerMinutes}
      applyStaggerAndSave={applyStaggerAndSave}
      visibleRoundRows={visibleRoundRows}
      dragId={dragId}
      setDragId={setDragId}
      handleDropOn={handleDropOn}
      parseRoundCountDraft={parseRoundCountDraft}
      roundCounts={roundCounts}
      roundStarts={roundStarts}
      setRoundStarts={setRoundStarts}
      saveRoundStart={saveRoundStart}
      saveRoundStartOnBlur={(eventId, roundIndex) => void saveRoundStart(eventId, roundIndex, { silent: true })}
      rowsByTabId={rowsByTabId}
      rowsByTabIdAndDay={rowsByTabIdAndDay}
      assignDirty={assignDirty}
      assignSaving={assignSaving}
      onSaveAssign={() => saveAssignPartition()}
      onDiscardAssign={discardAssignPartition}
      onBeforeLeaveAssignMode={onBeforeLeaveAssignMode}
      onAssignDropOn={handleAssignDropOn}
      deleteOpen={deleteOpen}
      deleteTargetTabId={deleteTargetTabId}
      deleteMigrateToTabId={deleteMigrateToTabId}
      submitDeleteTab={submitDeleteTab}
    />
  );

  if (splitRoundSettingsCard) {
    return (
      <div className="space-y-3">
        {roundSettingsCard}
        {scheduleCard}
      </div>
    );
  }

  return scheduleCard;
}
