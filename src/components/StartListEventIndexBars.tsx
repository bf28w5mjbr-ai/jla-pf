"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  buildScheduleTabListItems,
  expandEventsToScheduleRoundRows,
  filterEventsByScheduleTabId,
  type CompetitionScheduleTabLite,
} from "@/lib/competitionScheduleTabDisplay";
import {
  buildStartListAgeCategoryTabs,
  filterEventsByStartListAgeCategory,
  mergeReorderedEventsByIds,
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
  compareStartListEvents,
  effectiveStartMsForSort,
  sortByStartTimeOrder,
  sortEventsWithinScheduleTab,
  START_LIST_AUTO_SORT_STORAGE_KEY,
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
  const scheduleMinMax = useMemo(
    () => competitionScheduleDatetimeLocalMinMax(compStart, compEnd),
    [compStart, compEnd]
  );
  const [order, setOrder] = useState<StartListEventBarItem[]>(() => [...events].sort(compareStartListEvents));
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [roundStarts, setRoundStarts] = useState<Record<string, string>>({});
  const [timeSavingId, setTimeSavingId] = useState<string | null>(null);
  const [autoSortAfterSaveStart, setAutoSortAfterSaveStart] = useState(true);
  const [staggerBase, setStaggerBase] = useState("");
  const [staggerMinutes, setStaggerMinutes] = useState("15");
  const [bulkApplying, setBulkApplying] = useState(false);
  /** ラウンド設定カードの年齢（未分類）タブ */
  const [activeRoundSettingsAgeTab, setActiveRoundSettingsAgeTab] = useState<string>("");
  /** タイムスケジュールで表示・並べ替え対象にするエリア（スケジュールタブ） */
  const [activeAreaTabId, setActiveAreaTabId] = useState<string>("");
  const [newTabNameDraft, setNewTabNameDraft] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetTabId, setRenameTargetTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetTabId, setDeleteTargetTabId] = useState<string | null>(null);
  const [deleteMigrateToTabId, setDeleteMigrateToTabId] = useState<string>("");
  const [tabMutationSaving, setTabMutationSaving] = useState(false);

  const { sortedFromServer, serverSyncKey } = useMemo(() => {
    const sorted = [...events].sort(compareStartListEvents);
    return {
      sortedFromServer: sorted,
      serverSyncKey: serverEventsSyncKeyFromSorted(sorted),
    };
  }, [events]);

  const {
    roundCounts,
    setRoundCounts,
    heatDraftByEvent,
    roundSavingId,
    heatSavingEventId,
    heatPlanConfirmingId,
    parseRoundCountDraft,
    savedRoundCount,
    saveRoundCount,
    updateHeatTab,
    saveHeatPlanForEvent,
  } = useStartListRoundHeatDrafts({
    competitionId,
    mergeOrderedBarItems: order,
    roundCountResetBarItems: sortedFromServer,
    initialStartListSettings: initialStartListSettings ?? null,
    serverSyncKey,
    syncHeatDraftsFromSettings: canEditRoundCount,
  });

  const heatDraftSyncKey = useMemo(() => {
    const s =
      initialStartListSettings && typeof initialStartListSettings === "object"
        ? JSON.stringify(initialStartListSettings)
        : "";
    return `${serverSyncKey}|${s}`;
  }, [serverSyncKey, initialStartListSettings]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(START_LIST_AUTO_SORT_STORAGE_KEY) === "0") {
      setAutoSortAfterSaveStart(false);
    }
  }, []);

  useEffect(() => {
    setOrder(sortedFromServer);
    setRoundStarts(roundStartsDraftFromBarItems(sortedFromServer));
    // 配列参照を依存にすると React 19 で依存配列の長さが種目数に連動することがあるため、文字列キーのみ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverSyncKey に表示順・開始時刻の実体が含まれる
  }, [serverSyncKey]);

  const scheduleTabBarItems = useMemo(
    () => buildScheduleTabListItems(scheduleTabs, order),
    [scheduleTabs, order]
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

  const visibleEventsInArea = useMemo(() => {
    const soleTabId = scheduleTabs.length === 1 ? scheduleTabs[0]?.id : undefined;
    const filtered =
      soleTabId !== undefined
        ? order.filter(
            (e) => e.scheduleTabId === soleTabId || e.scheduleTabId == null
          )
        : filterEventsByScheduleTabId(order, resolvedActiveAreaTabId);
    return sortEventsWithinScheduleTab(filtered);
  }, [order, resolvedActiveAreaTabId, scheduleTabs]);

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

  const visibleRoundRows = useMemo(
    () =>
      expandEventsToScheduleRoundRows(visibleEventsInArea, roundCounts, (eventId) =>
        heatSettingForExpandedRow(eventId)
      ),
    [visibleEventsInArea, roundCounts, heatSettingForExpandedRow]
  );

  useEffect(() => {
    const first = scheduleTabs[0]?.id ?? "";
    if (!first) return;
    if (!activeAreaTabId || !scheduleTabs.some((t) => t.id === activeAreaTabId)) {
      setActiveAreaTabId(first);
    }
  }, [activeAreaTabId, scheduleTabs]);

  const persistTabEventOrder = async (
    tabId: string,
    nextVisibleOrderedEvents: StartListEventBarItem[],
    successMessage?: string
  ) => {
    if (!tabId) return;
    setReorderSaving(true);
    try {
      for (const e of nextVisibleOrderedEvents) {
        if ((e.scheduleTabId ?? "") === tabId) continue;
        const res = await fetch(`/api/competitions/${competitionId}/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleTabId: tabId }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message || "種目のエリア割当に失敗しました");
        }
      }

      const res = await fetch(
        `/api/competitions/${competitionId}/schedule-tabs/${encodeURIComponent(tabId)}/events/order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedEventIds: nextVisibleOrderedEvents.map((e) => e.id) }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "並べ替えの保存に失敗しました");
      toast.success(successMessage ?? "表示順を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "並べ替えの保存に失敗しました");
      setOrder([...events].sort(compareStartListEvents));
    } finally {
      setReorderSaving(false);
    }
  };

  const setAutoSortPreference = (enabled: boolean) => {
    setAutoSortAfterSaveStart(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(START_LIST_AUTO_SORT_STORAGE_KEY, enabled ? "1" : "0");
    }
  };

  const moveEventToScheduleTab = async (eventId: string, nextTabId: string) => {
    const ev = order.find((e) => e.id === eventId);
    if (!ev || (ev.scheduleTabId ?? "") === nextTabId) return;
    try {
      const res = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleTabId: nextTabId }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "エリアへの移動に失敗しました");
      toast.success(data.message || "エリアを変更しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エリアへの移動に失敗しました");
    }
  };

  const addScheduleTab = async () => {
    const name = newTabNameDraft.trim();
    if (!name) {
      toast.error("エリア名を入力してください");
      return;
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

  const submitRenameTab = async () => {
    if (!renameTargetTabId) return;
    const name = renameDraft.trim();
    if (!name) {
      toast.error("エリア名を入力してください");
      return;
    }
    setTabMutationSaving(true);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/schedule-tabs/${encodeURIComponent(renameTargetTabId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "エリア名の更新に失敗しました");
      toast.success(data.message || "エリア名を更新しました");
      setRenameOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エリア名の更新に失敗しました");
    } finally {
      setTabMutationSaving(false);
    }
  };

  const submitDeleteTab = async () => {
    if (!deleteTargetTabId) return;
    const src = scheduleTabBarItems.find((t) => t.id === deleteTargetTabId);
    if (src && src.eventCount > 0 && !deleteMigrateToTabId.trim()) {
      toast.error("種目を移す先のエリアを選んでください");
      return;
    }
    setTabMutationSaving(true);
    try {
      const qs =
        src && src.eventCount > 0
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

  const shiftActiveScheduleTab = async (dir: -1 | 1) => {
    const ids = scheduleTabs.map((t) => t.id);
    const i = ids.indexOf(resolvedActiveAreaTabId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    const a = next[i]!;
    const b = next[j]!;
    next[i] = b;
    next[j] = a;
    setTabMutationSaving(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/schedule-tabs/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedTabIds: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "エリアの並び替えに失敗しました");
      toast.success(data.message || "エリアの並びを更新しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エリアの並び替えに失敗しました");
    } finally {
      setTabMutationSaving(false);
    }
  };

  const saveRoundStart = async (eventId: string, roundIndex: number) => {
    const rk = roundStartKey(eventId, roundIndex);
    const raw = roundStarts[rk] ?? "";
    if (raw.trim() !== "") {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("日時の形式が不正です");
        return;
      }
      if (!isInstantWithinCompetitionEventSchedule(parsed, compStart, compEnd)) {
        toast.error("開始日時は大会の開催期間内にしてください");
        return;
      }
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
        }
      }

      if (canReorder && autoSortAfterSaveStart && apiEvents?.length) {
        const areaId = resolvedActiveAreaTabId;
        if (areaId) {
          const inArea = sortEventsWithinScheduleTab(
            filterEventsByScheduleTabId(mergedOrder, areaId)
          );
          const sortedInArea = sortByStartTimeOrder(inArea, mergedRoundStarts);
          const prevIds = inArea.map((e) => e.id).join(",");
          const nextIds = sortedInArea.map((e) => e.id).join(",");
          if (prevIds !== nextIds) {
            const nextFull = mergeReorderedEventsByIds(mergedOrder, sortedInArea.map((e) => e.id));
            const withSort = nextFull.map((e) => {
              if (e.scheduleTabId !== areaId) return e;
              const idx = sortedInArea.findIndex((v) => v.id === e.id);
              if (idx < 0) return e;
              return { ...e, scheduleTabSortOrder: idx + 1 };
            });
            setOrder(withSort);
            await persistTabEventOrder(
              areaId,
              sortedInArea,
              "開始時刻を保存し、時刻順に並べ替えました"
            );
            return;
          }
        }
      }

      toast.success(data.message || "開始時刻を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "開始時刻の保存に失敗しました");
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

      if (canReorder && autoSortAfterSaveStart) {
        const inAreaAfter = sortEventsWithinScheduleTab(
          filterEventsByScheduleTabId(mergedOrder, areaId)
        );
        const sortedInArea = sortByStartTimeOrder(inAreaAfter, nextRoundStarts);
        const prevOrder = inAreaAfter.map((e) => e.id).join(",");
        const nextOrderIds = sortedInArea.map((e) => e.id).join(",");
        if (prevOrder !== nextOrderIds) {
          const nextFull = mergeReorderedEventsByIds(mergedOrder, sortedInArea.map((e) => e.id));
          const withSort = nextFull.map((e) => {
            if (e.scheduleTabId !== areaId) return e;
            const idx = sortedInArea.findIndex((v) => v.id === e.id);
            if (idx < 0) return e;
            return { ...e, scheduleTabSortOrder: idx + 1 };
          });
          setOrder(withSort);
          await persistTabEventOrder(
            areaId,
            sortedInArea,
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

  const handleDropOn = (targetId: string) => {
    if (!canReorder || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const areaId = resolvedActiveAreaTabId;
    if (!areaId) {
      setDragId(null);
      return;
    }
    const nextVisible = [...visibleEventsInArea];
    const fi = nextVisible.findIndex((x) => x.id === dragId);
    const ti = nextVisible.findIndex((x) => x.id === targetId);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const [item] = nextVisible.splice(fi, 1);
    nextVisible.splice(ti, 0, item!);
    const next = mergeReorderedEventsByIds(order, nextVisible.map((event) => event.id));
    const withSort = next.map((e) => {
      if (e.scheduleTabId !== areaId) return e;
      const idx = nextVisible.findIndex((v) => v.id === e.id);
      if (idx < 0) return e;
      return { ...e, scheduleTabSortOrder: idx + 1 };
    });
    setOrder(withSort);
    setDragId(null);
    void persistTabEventOrder(areaId, nextVisible);
  };

  const handleSortByStartTime = () => {
    const areaId = resolvedActiveAreaTabId;
    if (!areaId) return;
    const inArea = visibleEventsInArea;
    const hasComparable = inArea.some((e) => Number.isFinite(effectiveStartMsForSort(e, roundStarts)));
    if (!hasComparable) {
      toast.info("このエリアで開始時刻が入力または保存されている種目がありません");
      return;
    }
    const sortedInArea = sortByStartTimeOrder(inArea, roundStarts);
    const unchanged = sortedInArea.every((e, i) => e.id === inArea[i]?.id);
    if (unchanged) {
      toast.info("すでに開始時刻順です");
      return;
    }
    const next = mergeReorderedEventsByIds(order, sortedInArea.map((event) => event.id));
    const withSort = next.map((e) => {
      if (e.scheduleTabId !== areaId) return e;
      const idx = sortedInArea.findIndex((v) => v.id === e.id);
      if (idx < 0) return e;
      return { ...e, scheduleTabSortOrder: idx + 1 };
    });
    setOrder(withSort);
    void persistTabEventOrder(areaId, sortedInArea, "開始時刻の早い順に並べ替えました");
  };

  const publicScheduleBarsOnly =
    !canReorder && !canEditSchedule && !canEditRoundCount;

  const splitRoundSettingsCard = canEditRoundCount;

  const hintRoundSettingsCard = (() => {
    if (publicScheduleBarsOnly) return "";
    return "ラウンド数を「保存」で確定してから「ヒート・レーンを保存」で記録まで完了してください（保存と同時に当日運用向けの確定が記録されます）。種目のスタートリストは下の一覧から。";
  })();

  const hintEventListCard = (() => {
    if (publicScheduleBarsOnly) {
      return "一覧の上から表示順です。行をタップでスタートリストを表示します。";
    }
    const parts: string[] = [];
    if (canReorder) {
      parts.push("表示中のエリア内で握りをドラッグして並べ替え（自動保存）");
    }
    parts.push("行をタップで詳細");
    if (canEditSchedule) {
      parts.push("開始は開催期内・終了は種目ページ");
    }
    return parts.join(" · ");
  })();

  const baselineForHeatUi = useMemo(
    () => parseStartListSettings(initialStartListSettings ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heatDraftSyncKey に settings の実体が含まれる
    [heatDraftSyncKey]
  );

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
      draft={{
        roundCounts,
        setRoundCounts,
        heatDraftByEvent,
        roundSavingId,
        heatSavingEventId,
        heatPlanConfirmingId,
        parseRoundCountDraft,
        savedRoundCount,
        saveRoundCount,
        updateHeatTab,
        saveHeatPlanForEvent,
      }}
      baselineForHeatUi={baselineForHeatUi}
      hintText={hintRoundSettingsCard}
      canEditSchedule={canEditSchedule}
      ageCategoryTabs={ageCategoryTabsForRoundSettings}
      activeAgeCategoryTab={resolvedRoundSettingsAgeTab}
      onAgeCategoryTabChange={setActiveRoundSettingsAgeTab}
      extraHeatUiLocked={bulkApplying || timeSavingId !== null || reorderSaving}
    />
  ) : null;

  const scheduleCard = (
    <StartListScheduleCard
      competitionId={competitionId}
      competitionName={competitionName}
      hintEventListCard={hintEventListCard}
      canReorder={canReorder}
      canEditSchedule={canEditSchedule}
      scheduleTabs={scheduleTabs}
      scheduleTabBarItems={scheduleTabBarItems}
      resolvedActiveAreaTabId={resolvedActiveAreaTabId}
      setActiveAreaTabId={setActiveAreaTabId}
      newTabNameDraft={newTabNameDraft}
      setNewTabNameDraft={setNewTabNameDraft}
      tabMutationSaving={tabMutationSaving}
      reorderSaving={reorderSaving}
      bulkApplying={bulkApplying}
      timeSavingId={timeSavingId}
      roundSavingId={roundSavingId}
      heatSavingEventId={heatSavingEventId}
      heatPlanConfirmingId={heatPlanConfirmingId}
      autoSortAfterSaveStart={autoSortAfterSaveStart}
      setAutoSortPreference={setAutoSortPreference}
      handleSortByStartTime={handleSortByStartTime}
      addScheduleTab={addScheduleTab}
      setRenameTargetTabId={setRenameTargetTabId}
      setRenameDraft={setRenameDraft}
      setRenameOpen={setRenameOpen}
      setDeleteTargetTabId={setDeleteTargetTabId}
      setDeleteMigrateToTabId={setDeleteMigrateToTabId}
      setDeleteOpen={setDeleteOpen}
      shiftActiveScheduleTab={shiftActiveScheduleTab}
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
      moveEventToScheduleTab={moveEventToScheduleTab}
      renameOpen={renameOpen}
      renameDraft={renameDraft}
      submitRenameTab={submitRenameTab}
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
