"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StartListEventRoundSettingsRow } from "@/components/StartListEventRoundSettingsRow";
import { useStartListRoundHeatDrafts } from "@/hooks/useStartListRoundHeatDrafts";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { serverEventsSyncKeyFromSorted } from "@/lib/startListEventBarServerSyncKey";
import {
  buildRoundTabsForRoundCount,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";

type Props = {
  competitionId: string;
  competitionName?: string;
  focusEventId: string;
  /** 全種目（ヒート設定 PUT のマージ用・大会スタートリストタブと同順） */
  barItems: StartListEventBarItem[];
  initialStartListSettings: unknown;
  /** 進行予定の表示（種目ページの見出しと揃える） */
  scheduleLabel?: string | null;
};

export function StartListEventPageRoundSettingsPanel({
  competitionId,
  competitionName,
  focusEventId,
  barItems,
  initialStartListSettings,
  scheduleLabel,
}: Props) {
  const serverSyncKey = useMemo(() => serverEventsSyncKeyFromSorted(barItems), [barItems]);

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
    mergeOrderedBarItems: barItems,
    roundCountResetBarItems: barItems,
    initialStartListSettings: initialStartListSettings ?? null,
    serverSyncKey,
    syncHeatDraftsFromSettings: true,
  });

  const focusEvent = useMemo(
    () => barItems.find((e) => e.id === focusEventId),
    [barItems, focusEventId]
  );

  const baselineForHeatUi = useMemo(
    () => parseStartListSettings(initialStartListSettings ?? null),
    [initialStartListSettings]
  );

  if (!focusEvent) return null;

  const mergedBase: HeatSetting = {
    ...(baselineForHeatUi.eventSettings[focusEvent.id] ?? {}),
    ...(heatDraftByEvent[focusEvent.id] ?? {}),
  };
  const displayTabs = buildRoundTabsForRoundCount(
    parseRoundCountDraft(roundCounts[focusEvent.id]),
    normalizeRoundTabs(mergedBase)
  );
  const draftN = parseRoundCountDraft(roundCounts[focusEvent.id]);
  const savedN = savedRoundCount(focusEvent);
  const heatUiLocked =
    heatSavingEventId !== null || roundSavingId !== null || heatPlanConfirmingId !== null;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-3 py-2 sm:px-4">
        <CardTitle className="text-sm font-semibold leading-tight">ラウンド設定</CardTitle>
        {competitionName ? (
          <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
        ) : null}
        {scheduleLabel ? (
          <p className="text-[10px] leading-snug text-muted-foreground">進行予定: {scheduleLabel}</p>
        ) : null}
        <p className="text-[10px] leading-snug text-muted-foreground">
          ラウンド数を保存してから、ヒート数・最大レーンを入力して「ヒート・レーンを保存」で確定します。ラウンドごとの最大レーンはここで編集でき、空欄のときは種目の既定レーン数が使われます。
        </p>
        {focusEvent.startListHeatPlanConfirmedAt ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-900 dark:text-amber-100">
            ヒート・レーンは確定済みですが、内容を変えて再保存できます。当日運用や記録に影響するので注意してください。マーシャル開始後は、分割やラウンド数の変更がサーバーで拒否されることがあります。
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/50">
          <StartListEventRoundSettingsRow
            event={focusEvent}
            scheduleText={null}
            displayTabs={displayTabs}
            draftN={draftN}
            savedN={savedN}
            roundCountValue={roundCounts[focusEvent.id] ?? "1"}
            onRoundCountChange={(value) =>
              setRoundCounts((p) => ({ ...p, [focusEvent.id]: value }))
            }
            heatUiLocked={heatUiLocked}
            roundSaveDisabled={
              roundSavingId === focusEvent.id ||
              heatSavingEventId !== null ||
              heatPlanConfirmingId !== null
            }
            savingRound={roundSavingId === focusEvent.id}
            onSaveRoundCount={() => void saveRoundCount(focusEvent.id)}
            onUpdateHeatTab={(tabIdx, patch) => updateHeatTab(focusEvent.id, tabIdx, patch)}
            heatSaveDisabled={
              heatUiLocked ||
              heatSavingEventId === focusEvent.id ||
              heatPlanConfirmingId === focusEvent.id ||
              draftN !== savedN
            }
            heatSaving={heatSavingEventId === focusEvent.id}
            heatPlanConfirming={heatPlanConfirmingId === focusEvent.id}
            onSaveHeatPlan={() => void saveHeatPlanForEvent(focusEvent.id)}
          />
        </ul>
        {roundSavingId ? (
          <p className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
            ラウンド数保存中…
          </p>
        ) : null}
        {heatSavingEventId ? (
          <p className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
            ヒート・レーン保存中…
          </p>
        ) : null}
        {heatPlanConfirmingId ? (
          <p className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
            ヒート・レーンの確定を記録中…
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
