"use client";

import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateForDatetimeLocalInput } from "@/lib/datetimeLocal";
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";
import {
  competitionScheduleDatetimeLocalMinMax,
  isInstantWithinCompetitionEventSchedule,
} from "@/lib/eventScheduleWithinCompetition";
import { cn } from "@/lib/utils";
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
  buildRoundTabsForRoundCount,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";
import { useStartListRoundHeatDrafts } from "@/hooks/useStartListRoundHeatDrafts";
import { StartListEventRoundSettingsRow } from "@/components/StartListEventRoundSettingsRow";

export type { StartListEventBarItem } from "@/lib/startListEventBarTypes";

type Props = {
  competitionId: string;
  competitionName?: string;
  competitionStartDate: Date | string;
  competitionEndDate: Date | string;
  /** タイムスケジュール用タブ（大会単位） */
  scheduleTabs: CompetitionScheduleTabLite[];
  events: StartListEventBarItem[];
  /** 大会の startListSettings（ラウンド別ヒート／レーン） */
  initialStartListSettings?: unknown;
  canReorder: boolean;
  /** 主催者管理者のみ。開始時刻のみ一覧から編集 */
  canEditSchedule?: boolean;
  /** 主催者管理者または承認済みオフィシャル。ラウンド数（1〜32） */
  canEditRoundCount?: boolean;
};

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

/** 男子→女子→その他（同一種目名の行順を固定） */
function sexSortKey(sex: string): number {
  if (sex === "MALE") return 0;
  if (sex === "FEMALE") return 1;
  return 2;
}

/**
 * displayOrder 主軸のまま、同順位・同名の男女行の順序を固定し、種目名は日本語の数値順に揃える。
 *（DB が displayOrder のみだと兄弟種目の順がブラウザごとにぶれることがある）
 */
function compareStartListEvents(a: StartListEventBarItem, b: StartListEventBarItem): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  const nc = a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" });
  if (nc !== 0) return nc;
  const sx = sexSortKey(a.sex) - sexSortKey(b.sex);
  if (sx !== 0) return sx;
  return a.id.localeCompare(b.id);
}

/** 同一エリア（スケジュールタブ）内の並び: DB の scheduleTabSortOrder を優先 */
function sortEventsWithinScheduleTab(events: readonly StartListEventBarItem[]): StartListEventBarItem[] {
  return [...events].sort((a, b) => {
    const oa = a.scheduleTabSortOrder ?? 0;
    const ob = b.scheduleTabSortOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return compareStartListEvents(a, b);
  });
}

/** 並べ替え用: 第1ラウンドの入力下書きがあれば優先し、なければ保存済み（ラウンド別または種目の scheduledStartAt）。未設定は後ろへ */
function effectiveStartMsForSort(
  e: StartListEventBarItem,
  roundStartsDraft: Record<string, string>
): number {
  const draft = roundStartsDraft[roundStartKey(e.id, 0)]?.trim();
  if (draft) {
    const d = new Date(draft);
    return Number.isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
  }
  const iso = effectiveRoundStartIso({
    scheduledStartAt: e.scheduledStartAt,
    roundScheduledStarts: e.roundScheduledStarts,
    roundIndex: 0,
  });
  if (iso) {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }
  return Number.POSITIVE_INFINITY;
}

function sortByStartTimeOrder(
  list: StartListEventBarItem[],
  roundStartsDraft: Record<string, string>
): StartListEventBarItem[] {
  return [...list].sort((a, b) => {
    const da = effectiveStartMsForSort(a, roundStartsDraft);
    const db = effectiveStartMsForSort(b, roundStartsDraft);
    if (da !== db) return da - db;
    return compareStartListEvents(a, b);
  });
}

const AUTO_SORT_STORAGE_KEY = "bluvium:start-list:auto-sort-after-save";

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
    if (typeof window !== "undefined" && window.localStorage.getItem(AUTO_SORT_STORAGE_KEY) === "0") {
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

  const visibleRoundSettingsEvents = useMemo(
    () => filterEventsByStartListAgeCategory(order, resolvedRoundSettingsAgeTab),
    [order, resolvedRoundSettingsAgeTab]
  );

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
      window.localStorage.setItem(AUTO_SORT_STORAGE_KEY, enabled ? "1" : "0");
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
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">ラウンド設定</CardTitle>
            {competitionName ? (
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{competitionName}</p>
            ) : null}
          </div>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">{hintRoundSettingsCard}</p>
      </CardHeader>
      <CardContent className="p-0">
        {ageCategoryTabsForRoundSettings.length > 1 ? (
          <div className="border-b border-border/50 bg-muted/10 px-2.5 py-1.5">
            <Tabs value={resolvedRoundSettingsAgeTab} onValueChange={setActiveRoundSettingsAgeTab}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 bg-muted/50 p-0.5">
                {ageCategoryTabsForRoundSettings.map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="shrink-0 px-2 py-1 text-[11px]">
                    {t.label}
                    <span className="ml-0.5 tabular-nums text-muted-foreground">({t.count})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
        <ul className="divide-y divide-border/50">
          {visibleRoundSettingsEvents.map((event) => {
            const scheduleText = canEditSchedule ? null : formatEventStartJa(event.scheduledStartAt);
            const mergedBase: HeatSetting = {
              ...(baselineForHeatUi.eventSettings[event.id] ?? {}),
              ...(heatDraftByEvent[event.id] ?? {}),
            };
            const displayTabs = buildRoundTabsForRoundCount(
              parseRoundCountDraft(roundCounts[event.id]),
              normalizeRoundTabs(mergedBase)
            );
            const draftN = parseRoundCountDraft(roundCounts[event.id]);
            const savedN = savedRoundCount(event);
            const heatUiLocked =
              bulkApplying ||
              timeSavingId !== null ||
              reorderSaving ||
              heatSavingEventId !== null ||
              roundSavingId !== null ||
              heatPlanConfirmingId !== null;
            return (
              <StartListEventRoundSettingsRow
                key={event.id}
                event={event}
                scheduleText={scheduleText}
                displayTabs={displayTabs}
                draftN={draftN}
                savedN={savedN}
                roundCountValue={roundCounts[event.id] ?? "1"}
                onRoundCountChange={(value) =>
                  setRoundCounts((p) => ({ ...p, [event.id]: value }))
                }
                heatUiLocked={heatUiLocked}
                roundSaveDisabled={
                  bulkApplying ||
                  roundSavingId === event.id ||
                  timeSavingId !== null ||
                  reorderSaving ||
                  heatSavingEventId !== null ||
                  heatPlanConfirmingId !== null
                }
                savingRound={roundSavingId === event.id}
                onSaveRoundCount={() => void saveRoundCount(event.id)}
                onUpdateHeatTab={(tabIdx, patch) => updateHeatTab(event.id, tabIdx, patch)}
                heatSaveDisabled={
                  heatUiLocked ||
                  heatSavingEventId === event.id ||
                  heatPlanConfirmingId === event.id ||
                  draftN !== savedN
                }
                heatSaving={heatSavingEventId === event.id}
                heatPlanConfirming={heatPlanConfirmingId === event.id}
                onSaveHeatPlan={() => void saveHeatPlanForEvent(event.id)}
              />
            );
          })}
        </ul>
        {roundSavingId ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            ラウンド数保存中…
          </p>
        ) : null}
        {heatSavingEventId ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            ヒート・レーン保存中…
          </p>
        ) : null}
        {heatPlanConfirmingId ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            ヒート・レーンの確定を記録中…
          </p>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  const eventListCard = (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <CardTitle className="text-sm font-semibold leading-tight">タイムスケジュール</CardTitle>
            {competitionName ? (
              <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
            ) : null}
          </div>
          {canReorder ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-0.5 px-2 text-[11px]"
                onClick={() => void handleSortByStartTime()}
                disabled={reorderSaving || bulkApplying || timeSavingId !== null || roundSavingId !== null || heatSavingEventId !== null || heatPlanConfirmingId !== null}
              >
                <Clock className="h-3 w-3" />
                時刻順
              </Button>
              {canEditSchedule ? (
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3 rounded border-input accent-primary"
                    checked={autoSortAfterSaveStart}
                    onChange={(e) => setAutoSortPreference(e.target.checked)}
                  />
                  保存後に時刻順へ
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">{hintEventListCard}</p>
        {scheduleTabs.length > 0 && (scheduleTabs.length > 1 || canReorder) ? (
          <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
            {scheduleTabs.length > 1 ? (
              <Tabs value={resolvedActiveAreaTabId} onValueChange={setActiveAreaTabId}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
                  <TabsList className="h-auto min-h-9 w-full max-w-full flex-1 flex-wrap justify-start gap-0.5 bg-muted/50 p-1">
                    {scheduleTabs.map((t) => (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="max-w-[11rem] shrink-0 px-2 py-1 text-left text-[11px]"
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="ml-0.5 shrink-0 tabular-nums text-muted-foreground">
                          ({scheduleTabBarItems.find((x) => x.id === t.id)?.eventCount ?? 0})
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {canReorder ? (
                    <div className="flex flex-wrap items-center gap-1 lg:shrink-0">
                      <Input
                        placeholder="例: メイン池 東側"
                        className="h-7 max-w-[10rem] text-[11px]"
                        value={newTabNameDraft}
                        onChange={(e) => setNewTabNameDraft(e.target.value)}
                        disabled={tabMutationSaving}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void addScheduleTab()}
                        disabled={tabMutationSaving || reorderSaving}
                        aria-label="エリアを追加"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-0.5 px-2 text-[11px]"
                        onClick={() => {
                          const tab = scheduleTabs.find((t) => t.id === resolvedActiveAreaTabId);
                          if (!tab) return;
                          setRenameTargetTabId(tab.id);
                          setRenameDraft(tab.name);
                          setRenameOpen(true);
                        }}
                        disabled={tabMutationSaving || !resolvedActiveAreaTabId}
                      >
                        <Pencil className="h-3 w-3" />
                        名前
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-0.5 px-2 text-[11px]"
                        onClick={() => {
                          setDeleteTargetTabId(resolvedActiveAreaTabId);
                          const other = scheduleTabs.find((t) => t.id !== resolvedActiveAreaTabId);
                          setDeleteMigrateToTabId(other?.id ?? "");
                          setDeleteOpen(true);
                        }}
                        disabled={
                          tabMutationSaving || scheduleTabs.length <= 1 || !resolvedActiveAreaTabId
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                        削除
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1 text-[11px]"
                        disabled={tabMutationSaving || scheduleTabs.length <= 1}
                        onClick={() => void shiftActiveScheduleTab(-1)}
                        aria-label="エリアを左へ"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1 text-[11px]"
                        disabled={tabMutationSaving || scheduleTabs.length <= 1}
                        onClick={() => void shiftActiveScheduleTab(1)}
                        aria-label="エリアを右へ"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Tabs>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                <Input
                  placeholder="例: メイン池 東側"
                  className="h-7 max-w-[10rem] text-[11px]"
                  value={newTabNameDraft}
                  onChange={(e) => setNewTabNameDraft(e.target.value)}
                  disabled={tabMutationSaving}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void addScheduleTab()}
                  disabled={tabMutationSaving || reorderSaving}
                  aria-label="エリアを追加"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[10px] text-muted-foreground">エリアを分けるときは名前を入れて追加</span>
              </div>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {canEditSchedule ? (
          <details className="group border-b border-border/50 bg-muted/5">
            <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground marker:content-none hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
              <span className="underline decoration-dotted underline-offset-2 group-open:no-underline">
                一括で開始時刻（表示中のエリアのリスト上から順に、各行＝ラウンドごとに分刻みで保存）
              </span>
            </summary>
            <div className="flex flex-wrap items-end gap-2 border-t border-border/40 px-2.5 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="stagger-base" className="text-[10px] text-muted-foreground">
                  1件目
                </Label>
                <Input
                  id="stagger-base"
                  type="datetime-local"
                  className="h-7 max-w-[10.5rem] text-[11px]"
                  min={scheduleMinMax.min}
                  max={scheduleMinMax.max}
                  value={staggerBase}
                  onChange={(e) => setStaggerBase(e.target.value)}
                  disabled={bulkApplying || roundSavingId !== null || reorderSaving || heatSavingEventId !== null || heatPlanConfirmingId !== null}
                />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor="stagger-step" className="text-[10px] text-muted-foreground">
                  間隔(分)
                </Label>
                <Input
                  id="stagger-step"
                  numericInput="integer"
                  min={1}
                  max={1440}
                  className="h-7 w-[4.25rem] text-[11px]"
                  value={staggerMinutes}
                  onChange={(e) => setStaggerMinutes(e.target.value)}
                  disabled={bulkApplying || roundSavingId !== null || reorderSaving || heatSavingEventId !== null || heatPlanConfirmingId !== null}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-[11px]"
                onClick={() => void applyStaggerAndSave()}
                disabled={bulkApplying || reorderSaving || timeSavingId !== null || roundSavingId !== null || heatSavingEventId !== null || heatPlanConfirmingId !== null}
              >
                {bulkApplying ? "保存中…" : "このエリアに保存"}
              </Button>
            </div>
          </details>
        ) : null}
        <ul className="divide-y divide-border/50">
          {visibleRoundRows.length === 0 ? (
            <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              {scheduleTabs.length > 1
                ? "このエリアに表示する種目がありません。行の「エリア」から移すか、別のエリアを選んでください。"
                : "表示する種目がありません。エリアを追加すると種目を分けて表示できます。"}
            </li>
          ) : null}
          {visibleRoundRows.map(({ event, roundIndex, roundLabel }) => {
            const rk = roundStartKey(event.id, roundIndex);
            const roundIso = effectiveRoundStartIso({
              scheduledStartAt: event.scheduledStartAt,
              roundScheduledStarts: event.roundScheduledStarts,
              roundIndex,
            });
            const scheduleText = canEditSchedule
              ? null
              : roundIso
                ? formatEventStartJa(roundIso)
                : null;
            const rowDrop = canReorder
              ? {
                  onDragOver: (e: DragEvent) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    handleDropOn(event.id);
                  },
                }
              : {};
            const nRounds = parseRoundCountDraft(roundCounts[event.id]);
            const startListHref =
              nRounds > 1
                ? `/competitions/${competitionId}/start-list/${event.id}?roundIndex=${roundIndex}`
                : `/competitions/${competitionId}/start-list/${event.id}`;
            const tabSelectValue = event.scheduleTabId ?? scheduleTabs[0]?.id ?? "";

            return (
              <li
                key={`${event.id}-${roundIndex}`}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-stretch",
                  dragId === event.id ? "bg-muted/40" : roundIndex % 2 === 1 ? "bg-muted/[0.06]" : ""
                )}
              >
                <div className="flex min-w-0 flex-1 items-stretch">
                  {canReorder ? (
                    <button
                      type="button"
                      draggable
                      aria-label={`${event.name}（${roundLabel}）の並べ替え`}
                      className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center border-r border-border/50 px-0 text-muted-foreground active:cursor-grabbing"
                      onDragStart={(e) => {
                        setDragId(event.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", event.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      {...rowDrop}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {canReorder && scheduleTabs.length > 1 ? (
                    <div className="flex w-[8.25rem] shrink-0 items-center justify-center border-r border-border/50 px-1">
                      <Select
                        value={tabSelectValue}
                        onValueChange={(v) => void moveEventToScheduleTab(event.id, v)}
                      >
                        <SelectTrigger
                          className="h-7 w-full max-w-[7.5rem] text-[10px]"
                          aria-label={`${event.name} のエリア`}
                        >
                          <SelectValue placeholder="エリア" />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduleTabs.map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <Link
                    href={startListHref}
                    className="flex min-w-0 flex-1 flex-col gap-0 px-2 py-1.5 text-left text-sm transition hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5"
                    {...rowDrop}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight">
                        {event.name}
                        <span className="font-normal text-muted-foreground"> · {roundLabel}</span>
                      </span>
                      {scheduleText ? (
                        <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                          {scheduleText}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {sexLabel(event.sex)}
                      {event.type === "TEAM" ? " · 団体" : " · 個人"}
                      {event.ageCategoryName ? ` · ${event.ageCategoryName}` : ""}
                    </span>
                  </Link>
                </div>
                {canEditSchedule ? (
                  <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1 sm:w-auto sm:border-l sm:border-t-0 sm:py-1 sm:pl-2 sm:pr-2">
                    <Input
                      type="datetime-local"
                      aria-label={`${event.name}（${roundLabel}）の開始時刻`}
                      className="h-7 max-w-[10.5rem] text-[11px]"
                      min={scheduleMinMax.min}
                      max={scheduleMinMax.max}
                      value={roundStarts[rk] ?? ""}
                      onChange={(e) =>
                        setRoundStarts((p) => ({ ...p, [rk]: e.target.value }))
                      }
                      disabled={
                        bulkApplying ||
                        roundSavingId !== null ||
                        reorderSaving ||
                        heatSavingEventId !== null ||
                        heatPlanConfirmingId !== null
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => void saveRoundStart(event.id, roundIndex)}
                      disabled={
                        bulkApplying ||
                        timeSavingId === `${event.id}:${roundIndex}` ||
                        roundSavingId !== null ||
                        reorderSaving ||
                        heatSavingEventId !== null ||
                        heatPlanConfirmingId !== null
                      }
                    >
                      {timeSavingId === `${event.id}:${roundIndex}` ? "保存中" : "保存"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canReorder && reorderSaving ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            並べ替え保存中…
          </p>
        ) : null}
        {canEditSchedule && bulkApplying ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            一括保存中…
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  const scheduleTabDialogsEl = (
    <>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>エリア名を変更</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="rename-schedule-tab" className="text-xs text-muted-foreground">
              名前
            </Label>
            <Input
              id="rename-schedule-tab"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-9 text-sm"
              maxLength={64}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" onClick={() => void submitRenameTab()} disabled={tabMutationSaving}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>エリアを削除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            このエリアを削除します。種目が残っている場合は、あらかじめ移動先のエリアを選んでください。
          </p>
          {deleteTargetTabId &&
          (scheduleTabBarItems.find((x) => x.id === deleteTargetTabId)?.eventCount ?? 0) > 0 ? (
            <div className="space-y-2 py-2">
              <Label className="text-xs text-muted-foreground">移動先エリア</Label>
              <Select value={deleteMigrateToTabId} onValueChange={setDeleteMigrateToTabId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="エリアを選択" />
                </SelectTrigger>
                <SelectContent>
                  {scheduleTabs
                    .filter((t) => t.id !== deleteTargetTabId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-sm">
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submitDeleteTab()}
              disabled={tabMutationSaving}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (splitRoundSettingsCard) {
    return (
      <>
        <div className="space-y-3">
          {roundSettingsCard}
          {eventListCard}
        </div>
        {scheduleTabDialogsEl}
      </>
    );
  }

  return (
    <>
      {eventListCard}
      {scheduleTabDialogsEl}
    </>
  );
}
