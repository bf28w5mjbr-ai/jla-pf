"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { clampRoundTabsToNonIncreasingHeatCounts } from "@/lib/startListEventHeatValidation";
import {
  isMarshalRoundLocked,
  roundTabSplitFingerprint,
} from "@/lib/marshalRoundSettingsLock";
import {
  parseStartListSettings,
  resolveRoundTabsForEvent,
  type HeatSetting,
  type StartListRoundTab,
} from "@/lib/startListSettings";

function initialRoundCountsFromBarItems(items: readonly StartListEventBarItem[]) {
  const rc: Record<string, string> = {};
  for (const e of items) {
    const n =
      typeof e.startListRoundCount === "number" && e.startListRoundCount >= 1
        ? Math.min(32, e.startListRoundCount)
        : 1;
    rc[e.id] = String(n);
  }
  return rc;
}

function initialHeatDraftByEvent(
  syncHeatDraftsFromSettings: boolean,
  initialStartListSettings: unknown
): Record<string, HeatSetting> {
  if (!syncHeatDraftsFromSettings) return {};
  const { eventSettings } = parseStartListSettings(initialStartListSettings ?? null);
  return { ...eventSettings };
}

function mergedHeatSettingForEvent(
  baseline: Record<string, HeatSetting>,
  draft: Record<string, HeatSetting>,
  eventId: string
): HeatSetting {
  return {
    ...(baseline[eventId] ?? {}),
    ...(draft[eventId] ?? {}),
  };
}

function roundTabsDraftFingerprint(tabs: StartListRoundTab[]): string {
  return JSON.stringify(tabs.map((t) => roundTabSplitFingerprint(t)));
}

export type RoundSettingsDirtyState = {
  roundDirty: StartListEventBarItem[];
  heatDirty: StartListEventBarItem[];
  needsConfirm: StartListEventBarItem[];
  marshalRoundBlocked: StartListEventBarItem[];
  totalDirty: number;
};

export type UseStartListRoundHeatDraftsArgs = {
  competitionId: string;
  /** 保存時に items を構築する種目一覧 */
  mergeOrderedBarItems: StartListEventBarItem[];
  /** サーバー同期時にラウンド数入力を初期化する基準一覧 */
  roundCountResetBarItems: StartListEventBarItem[];
  initialStartListSettings: unknown;
  serverSyncKey: string;
  syncHeatDraftsFromSettings: boolean;
};

export function useStartListRoundHeatDrafts({
  competitionId,
  mergeOrderedBarItems,
  roundCountResetBarItems,
  initialStartListSettings,
  serverSyncKey,
  syncHeatDraftsFromSettings,
}: UseStartListRoundHeatDraftsArgs) {
  const router = useRouter();
  const [roundCounts, setRoundCounts] = useState(() =>
    initialRoundCountsFromBarItems(roundCountResetBarItems)
  );
  const [bulkSaving, setBulkSaving] = useState(false);
  const [heatDraftByEvent, setHeatDraftByEvent] = useState(() =>
    initialHeatDraftByEvent(syncHeatDraftsFromSettings, initialStartListSettings)
  );

  const baselineParsed = useMemo(
    () => parseStartListSettings(initialStartListSettings ?? null),
    [initialStartListSettings]
  );

  const heatDraftSyncKey = useMemo(() => {
    const s =
      initialStartListSettings && typeof initialStartListSettings === "object"
        ? JSON.stringify(initialStartListSettings)
        : "";
    return `${serverSyncKey}|${s}`;
  }, [serverSyncKey, initialStartListSettings]);

  useEffect(() => {
    if (!syncHeatDraftsFromSettings) return;
    setHeatDraftByEvent({ ...baselineParsed.eventSettings });
  }, [heatDraftSyncKey, syncHeatDraftsFromSettings, baselineParsed]);

  useEffect(() => {
    const rc: Record<string, string> = {};
    for (const e of roundCountResetBarItems) {
      const n =
        typeof e.startListRoundCount === "number" && e.startListRoundCount >= 1
          ? Math.min(32, e.startListRoundCount)
          : 1;
      rc[e.id] = String(n);
    }
    setRoundCounts(rc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverSyncKey に表示順・開始時刻の実体が含まれる
  }, [serverSyncKey]);

  const parseRoundCountDraft = useCallback((raw: string | undefined): number => {
    const n = Number(String(raw ?? "1").trim());
    if (!Number.isInteger(n) || n < 1 || n > 32) return 1;
    return n;
  }, []);

  const savedRoundCount = useCallback((e: StartListEventBarItem): number => {
    const n = e.startListRoundCount;
    if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 32) return n;
    return 1;
  }, []);

  const buildRoundTabsForEvent = useCallback(
    (event: StartListEventBarItem): StartListRoundTab[] => {
      const merged = mergedHeatSettingForEvent(
        baselineParsed.eventSettings,
        heatDraftByEvent,
        event.id
      );
      const n = parseRoundCountDraft(roundCounts[event.id]);
      return clampRoundTabsToNonIncreasingHeatCounts(
        resolveRoundTabsForEvent({
          heatSetting: merged,
          roundCount: n,
        }),
        event.entryCount ?? 0,
        event.preliminaryHeatLaneCount ?? null
      );
    },
    [baselineParsed.eventSettings, heatDraftByEvent, parseRoundCountDraft, roundCounts]
  );

  const getDirtyState = useCallback(
    (visibleEvents: readonly StartListEventBarItem[]): RoundSettingsDirtyState => {
      const roundDirty: StartListEventBarItem[] = [];
      const heatDirty: StartListEventBarItem[] = [];
      const needsConfirm: StartListEventBarItem[] = [];
      const marshalRoundBlocked: StartListEventBarItem[] = [];

      for (const e of visibleEvents) {
        const draftN = parseRoundCountDraft(roundCounts[e.id]);
        const savedN = savedRoundCount(e);
        if (draftN !== savedN) {
          roundDirty.push(e);
          if ((e.marshalLockedRounds?.length ?? 0) > 0) {
            marshalRoundBlocked.push(e);
          }
        }

        const savedSetting = baselineParsed.eventSettings[e.id];
        const draftSetting = mergedHeatSettingForEvent(
          baselineParsed.eventSettings,
          heatDraftByEvent,
          e.id
        );
        const savedTabs = resolveRoundTabsForEvent({
          heatSetting: savedSetting,
          roundCount: savedN,
        });
        const draftTabs = resolveRoundTabsForEvent({
          heatSetting: draftSetting,
          roundCount: draftN,
        });
        const savedFp = roundTabsDraftFingerprint(savedTabs);
        const draftFp = roundTabsDraftFingerprint(draftTabs);
        if (savedFp !== draftFp || draftN !== savedN) {
          if (!heatDirty.some((x) => x.id === e.id)) {
            heatDirty.push(e);
          }
        }

        const tabCount = Math.max(savedTabs.length, draftTabs.length, draftN, savedN);
        for (let i = 0; i < tabCount; i += 1) {
          if (roundTabSplitFingerprint(savedTabs[i]) === roundTabSplitFingerprint(draftTabs[i])) {
            continue;
          }
          if (isMarshalRoundLocked(e.marshalLockedRounds, i, draftN)) {
            if (!marshalRoundBlocked.some((x) => x.id === e.id)) {
              marshalRoundBlocked.push(e);
            }
            break;
          }
        }

        if (!e.startListHeatPlanConfirmedAt && !(e.marshalLockedRounds?.length ?? 0)) {
          needsConfirm.push(e);
        }
      }

      const dirtyIds = new Set([
        ...roundDirty.map((e) => e.id),
        ...heatDirty.map((e) => e.id),
      ]);

      return {
        roundDirty,
        heatDirty,
        needsConfirm,
        marshalRoundBlocked,
        totalDirty: dirtyIds.size,
      };
    },
    [
      baselineParsed.eventSettings,
      heatDraftByEvent,
      parseRoundCountDraft,
      roundCounts,
      savedRoundCount,
    ]
  );

  const updateHeatTab = useCallback(
    (eventId: string, tabIndex: number, patch: Partial<StartListRoundTab>) => {
      setHeatDraftByEvent((prev) => {
        const event = mergeOrderedBarItems.find((e) => e.id === eventId);
        const mergedBase = mergedHeatSettingForEvent(
          baselineParsed.eventSettings,
          prev,
          eventId
        );
        const n = parseRoundCountDraft(roundCounts[eventId]);
        const tabs = resolveRoundTabsForEvent({
          heatSetting: mergedBase,
          roundCount: n,
        }).map((t, i) => (i === tabIndex ? { ...t, ...patch } : t));
        const clamped = event
          ? clampRoundTabsToNonIncreasingHeatCounts(
              tabs,
              event.entryCount ?? 0,
              event.preliminaryHeatLaneCount ?? null
            )
          : tabs;
        return {
          ...prev,
          [eventId]: {
            ...mergedBase,
            roundTabs: clamped,
          },
        };
      });
    },
    [baselineParsed, mergeOrderedBarItems, parseRoundCountDraft, roundCounts]
  );

  const saveAllRoundSettings = useCallback(
    async (visibleEvents: readonly StartListEventBarItem[]) => {
      const dirty = getDirtyState(visibleEvents);
      if (dirty.totalDirty === 0) {
        toast.message("変更はありません");
        return;
      }
      if (dirty.marshalRoundBlocked.length > 0) {
        toast.error("マーシャル締切済みのラウンドは変更できません");
        return;
      }

      for (const e of [...dirty.roundDirty, ...dirty.heatDirty]) {
        const n = parseRoundCountDraft(roundCounts[e.id]);
        if (!Number.isInteger(n) || n < 1 || n > 32) {
          toast.error(`${e.name} のラウンド数は1〜32の整数にしてください`);
          return;
        }
      }

      const dirtyEvents = [...new Map(
        [...dirty.roundDirty, ...dirty.heatDirty].map((e) => [e.id, e] as const)
      ).values()];

      const items = dirtyEvents.map((e) => {
        const roundTabs = buildRoundTabsForEvent(e);
        return {
          eventId: e.id,
          startListRoundCount: parseRoundCountDraft(roundCounts[e.id]),
          roundTabs,
        };
      });

      const confirmEventIds = dirtyEvents
        .filter((e) => !e.startListHeatPlanConfirmedAt && !(e.marshalLockedRounds?.length ?? 0))
        .map((e) => e.id);

      setBulkSaving(true);
      try {
        const res = await fetch(
          `/api/competitions/${competitionId}/round-setup/bulk-save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items,
              captureSnapshot: true,
              confirmEventIds,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          snapshotCapture?:
            | {
                ok: true;
                snapshotId: string;
                wasUpdate: boolean;
                tailInvalidated?: boolean;
                tailInvalidatedMessage?: string;
              }
            | { ok: false; error: string };
          confirmResults?: Array<{ eventId: string; ok: boolean; message?: string }>;
        };
        if (!res.ok) {
          throw new Error(data.message || "ラウンド設定の一括保存に失敗しました");
        }

        if (data.snapshotCapture?.ok === false) {
          toast.error(
            data.snapshotCapture.error ||
              "スタートリスト記録の更新に失敗しました（設定は保存済みです）。もう一度保存してください。"
          );
          router.refresh();
          return;
        }

        const confirmFailed = (data.confirmResults ?? []).filter((r) => !r.ok);
        if (confirmFailed.length > 0) {
          toast.error(
            confirmFailed[0]?.message ||
              "設定は保存済みですが、確定の記録に一部失敗しました。"
          );
        } else {
          toast.success(data.message || "ラウンド設定を一括保存しました");
        }
        if (
          data.snapshotCapture?.ok === true &&
          data.snapshotCapture.tailInvalidated &&
          data.snapshotCapture.tailInvalidatedMessage
        ) {
          toast.info(data.snapshotCapture.tailInvalidatedMessage);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ラウンド設定の一括保存に失敗しました");
      } finally {
        setBulkSaving(false);
      }
    },
    [
      buildRoundTabsForEvent,
      competitionId,
      getDirtyState,
      parseRoundCountDraft,
      roundCounts,
      router,
    ]
  );

  return {
    roundCounts,
    setRoundCounts,
    heatDraftByEvent,
    bulkSaving,
    parseRoundCountDraft,
    savedRoundCount,
    buildRoundTabsForEvent,
    getDirtyState,
    updateHeatTab,
    saveAllRoundSettings,
  };
}

export type StartListRoundHeatDraftControls = ReturnType<typeof useStartListRoundHeatDrafts>;
