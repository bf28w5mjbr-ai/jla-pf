"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { clampRoundTabsToNonIncreasingHeatCounts } from "@/lib/startListEventHeatValidation";
import { captureStartListSnapshotAfterHeatSave } from "@/lib/startListHeatSaveClient";
import {
  buildRoundTabsForRoundCount,
  buildStartListSettingsPayload,
  normalizeRoundTabs,
  parseStartListSettings,
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

export type UseStartListRoundHeatDraftsArgs = {
  competitionId: string;
  /** ヒート PUT でマージする種目一覧（並べ替え中は IndexBars の `order`） */
  mergeOrderedBarItems: StartListEventBarItem[];
  /**
   * サーバー同期時にラウンド数入力を初期化する基準一覧（IndexBars ではソート済みサーバー行）
   */
  roundCountResetBarItems: StartListEventBarItem[];
  initialStartListSettings: unknown;
  /** サーバー再配列・設定更新のたびに下書きとラウンド数入力をリセットするキー */
  serverSyncKey: string;
  /** false のとき heatDraft は initialSettings から同期しない */
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
  const [roundSavingId, setRoundSavingId] = useState<string | null>(null);
  const [heatDraftByEvent, setHeatDraftByEvent] = useState(() =>
    initialHeatDraftByEvent(syncHeatDraftsFromSettings, initialStartListSettings)
  );
  const [heatSavingEventId, setHeatSavingEventId] = useState<string | null>(null);
  const [heatPlanConfirmingId, setHeatPlanConfirmingId] = useState<string | null>(null);

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

  const saveRoundCount = useCallback(
    async (eventId: string) => {
      const raw = (roundCounts[eventId] ?? "1").trim();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 32) {
        toast.error("ラウンド数は1〜32の整数にしてください");
        return;
      }
      setRoundSavingId(eventId);
      try {
        const res = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startListRoundCount: n }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) throw new Error(data.message || "ラウンド数の保存に失敗しました");
        toast.success(data.message || "ラウンド数を保存しました");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ラウンド数の保存に失敗しました");
      } finally {
        setRoundSavingId(null);
      }
    },
    [competitionId, roundCounts, router]
  );

  const updateHeatTab = useCallback(
    (eventId: string, tabIndex: number, patch: Partial<StartListRoundTab>) => {
      setHeatDraftByEvent((prev) => {
        const mergedBase: HeatSetting = {
          ...(baselineParsed.eventSettings[eventId] ?? {}),
          ...(prev[eventId] ?? {}),
        };
        const n = parseRoundCountDraft(roundCounts[eventId]);
        const tabs = buildRoundTabsForRoundCount(n, normalizeRoundTabs(mergedBase)).map((t, i) =>
          i === tabIndex ? { ...t, ...patch } : t
        );
        return {
          ...prev,
          [eventId]: {
            ...mergedBase,
            roundTabs: tabs,
            mode: tabs[0]?.mode === "size" ? "size" : "count",
            heatCount: tabs[0]?.heatCount ?? "1",
            heatSize: tabs[0]?.heatSize ?? "",
          },
        };
      });
    },
    [baselineParsed, parseRoundCountDraft, roundCounts]
  );

  const saveHeatPlanForEvent = useCallback(
    async (eventId: string) => {
      const ev = mergeOrderedBarItems.find((e) => e.id === eventId);
      if (!ev) return;
      const draftN = parseRoundCountDraft(roundCounts[eventId]);
      if (draftN !== savedRoundCount(ev)) {
        toast.error("先に「ラウンド」の保存でラウンド数を確定してください");
        return;
      }
      setHeatSavingEventId(eventId);
      try {
        const full: Record<string, HeatSetting> = {};
        for (const e of mergeOrderedBarItems) {
          const mergedBase: HeatSetting = {
            ...(baselineParsed.eventSettings[e.id] ?? {}),
            ...(heatDraftByEvent[e.id] ?? {}),
          };
          const n = savedRoundCount(e);
          const tabs = clampRoundTabsToNonIncreasingHeatCounts(
            buildRoundTabsForRoundCount(n, normalizeRoundTabs(mergedBase)),
            e.entryCount ?? 0,
            e.preliminaryHeatLaneCount ?? null
          );
          full[e.id] = {
            ...mergedBase,
            roundTabs: tabs,
            mode: tabs[0]?.mode === "size" ? "size" : "count",
            heatCount: tabs[0]?.heatCount ?? "1",
            heatSize: tabs[0]?.heatSize ?? "",
          };
        }
        const payload = buildStartListSettingsPayload({
          eventSettings: full,
          teamAssignmentDeadline: baselineParsed.teamAssignmentDeadline,
        });
        const res = await fetch(`/api/competitions/${competitionId}/start-list-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startListSettings: payload, captureSnapshot: true }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          snapshotCapture?:
            | { ok: true; snapshotId: string; wasUpdate: boolean }
            | { ok: false; error: string };
        };
        if (!res.ok) throw new Error(data.message || "ヒート・レーン設定の保存に失敗しました");

        let snapOk: boolean;
        if (data.snapshotCapture !== undefined) {
          snapOk = data.snapshotCapture.ok === true;
          if (data.snapshotCapture.ok === false) {
            toast.error(
              data.snapshotCapture.error ||
                "スタートリスト記録の更新に失敗しました（ヒート設定は保存済みです）。もう一度保存してください。"
            );
          }
        } else {
          snapOk = await captureStartListSnapshotAfterHeatSave(competitionId);
        }
        if (!snapOk) {
          router.refresh();
          return;
        }
        if (!ev.startListHeatPlanConfirmedAt && !ev.marshalStartedAt) {
          setHeatPlanConfirmingId(eventId);
          try {
            const cres = await fetch(
              `/api/competitions/${competitionId}/events/${encodeURIComponent(eventId)}/heat-plan/confirm`,
              { method: "POST" }
            );
            const cdata = (await cres.json().catch(() => ({}))) as { message?: string };
            if (!cres.ok) {
              throw new Error(
                cdata.message ||
                  "ヒート設定は保存済みですが、確定の記録に失敗しました。もう一度「ヒート・レーンを保存」してください。"
              );
            }
          } finally {
            setHeatPlanConfirmingId(null);
          }
        }
        toast.success(data.message || "ヒート・レーンを保存し確定しました");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ヒート・レーン設定の保存に失敗しました");
      } finally {
        setHeatSavingEventId(null);
      }
    },
    [
      baselineParsed,
      competitionId,
      heatDraftByEvent,
      mergeOrderedBarItems,
      parseRoundCountDraft,
      roundCounts,
      router,
      savedRoundCount,
    ]
  );

  return {
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
  };
}
