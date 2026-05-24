"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StartListEventRoundSettingsRow } from "@/components/StartListEventRoundSettingsRow";
import {
  useStartListRoundHeatDrafts,
  type StartListRoundHeatDraftControls,
} from "@/hooks/useStartListRoundHeatDrafts";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { serverEventsSyncKeyFromSorted } from "@/lib/startListEventBarServerSyncKey";
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";
import {
  buildStartListAgeCategoryTabs,
  filterEventsByStartListAgeCategory,
} from "@/lib/startListAgeCategoryTabs";
import {
  buildRoundTabsForRoundCount,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";

type AgeCategoryTab = { key: string; label: string; count: number };

type StartListRoundSettingsCardProps = {
  competitionName?: string;
  events: StartListEventBarItem[];
  draft: StartListRoundHeatDraftControls;
  baselineForHeatUi: ReturnType<typeof parseStartListSettings>;
  focusEventId?: string;
  scheduleLabel?: string | null;
  hintText?: string;
  canEditSchedule?: boolean;
  ageCategoryTabs?: AgeCategoryTab[];
  activeAgeCategoryTab?: string;
  onAgeCategoryTabChange?: (key: string) => void;
  extraHeatUiLocked?: boolean;
  headerClassName?: string;
  contentStatusClassName?: string;
};

export function StartListRoundSettingsCard({
  competitionName,
  events,
  draft,
  baselineForHeatUi,
  focusEventId,
  scheduleLabel,
  hintText,
  canEditSchedule = false,
  ageCategoryTabs,
  activeAgeCategoryTab,
  onAgeCategoryTabChange,
  extraHeatUiLocked = false,
  headerClassName = "px-2.5 py-1.5",
  contentStatusClassName = "px-2.5",
}: StartListRoundSettingsCardProps) {
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
  } = draft;

  const visibleEvents = useMemo(() => {
    if (focusEventId) {
      const focus = events.find((e) => e.id === focusEventId);
      return focus ? [focus] : [];
    }
    if (ageCategoryTabs && ageCategoryTabs.length > 1 && activeAgeCategoryTab) {
      return filterEventsByStartListAgeCategory(events, activeAgeCategoryTab);
    }
    return events;
  }, [events, focusEventId, ageCategoryTabs, activeAgeCategoryTab]);

  if (visibleEvents.length === 0) return null;

  const defaultHint =
    "ラウンド数を保存してから、ヒート数・最大レーンを入力して「ヒート・レーンを保存」で確定します。ラウンドごとの最大レーンはここで編集でき、空欄のときは種目の既定レーン数が使われます。";

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className={`space-y-0.5 border-b border-border/80 bg-muted/15 ${headerClassName}`}>
        <CardTitle className="text-sm font-semibold leading-tight">ラウンド設定</CardTitle>
        {competitionName ? (
          <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
        ) : null}
        {scheduleLabel ? (
          <p className="text-[10px] leading-snug text-muted-foreground">進行予定: {scheduleLabel}</p>
        ) : null}
        <p className="text-[10px] leading-snug text-muted-foreground">{hintText ?? defaultHint}</p>
        {focusEventId && visibleEvents[0]?.startListHeatPlanConfirmedAt ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-900 dark:text-amber-100">
            ヒート・レーンは確定済みですが、内容を変えて再保存できます。当日運用や記録に影響するので注意してください。マーシャル開始後は、分割やラウンド数の変更がサーバーで拒否されることがあります。
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {ageCategoryTabs && ageCategoryTabs.length > 1 && activeAgeCategoryTab && onAgeCategoryTabChange ? (
          <div className="border-b border-border/50 bg-muted/10 px-2.5 py-1.5">
            <Tabs value={activeAgeCategoryTab} onValueChange={onAgeCategoryTabChange}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 bg-muted/50 p-0.5">
                {ageCategoryTabs.map((t) => (
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
          {visibleEvents.map((event) => {
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
              extraHeatUiLocked ||
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
                  extraHeatUiLocked ||
                  roundSavingId === event.id ||
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
          <p className={`border-t border-border/50 py-1 text-[10px] text-muted-foreground ${contentStatusClassName}`}>
            ラウンド数保存中…
          </p>
        ) : null}
        {heatSavingEventId ? (
          <p className={`border-t border-border/50 py-1 text-[10px] text-muted-foreground ${contentStatusClassName}`}>
            ヒート・レーン保存中…
          </p>
        ) : null}
        {heatPlanConfirmingId ? (
          <p className={`border-t border-border/50 py-1 text-[10px] text-muted-foreground ${contentStatusClassName}`}>
            ヒート・レーンの確定を記録中…
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type WithHookProps = {
  competitionId: string;
  competitionName?: string;
  barItems: StartListEventBarItem[];
  mergeOrderedBarItems?: StartListEventBarItem[];
  roundCountResetBarItems?: StartListEventBarItem[];
  initialStartListSettings: unknown;
  focusEventId?: string;
  scheduleLabel?: string | null;
  hintText?: string;
};

/** 種目ページなど、親が draft を持たない場合に hook 込みで描画する */
export function StartListRoundSettingsCardWithHook({
  competitionId,
  competitionName,
  barItems,
  mergeOrderedBarItems,
  roundCountResetBarItems,
  initialStartListSettings,
  focusEventId,
  scheduleLabel,
  hintText,
}: WithHookProps) {
  const serverSyncKey = useMemo(() => serverEventsSyncKeyFromSorted(barItems), [barItems]);
  const draft = useStartListRoundHeatDrafts({
    competitionId,
    mergeOrderedBarItems: mergeOrderedBarItems ?? barItems,
    roundCountResetBarItems: roundCountResetBarItems ?? barItems,
    initialStartListSettings: initialStartListSettings ?? null,
    serverSyncKey,
    syncHeatDraftsFromSettings: true,
  });
  const baselineForHeatUi = useMemo(
    () => parseStartListSettings(initialStartListSettings ?? null),
    [initialStartListSettings]
  );

  return (
    <StartListRoundSettingsCard
      competitionName={competitionName}
      events={barItems}
      draft={draft}
      baselineForHeatUi={baselineForHeatUi}
      focusEventId={focusEventId}
      scheduleLabel={scheduleLabel}
      hintText={hintText}
      headerClassName="px-3 py-2 sm:px-4"
      contentStatusClassName="px-3 sm:px-4"
    />
  );
}

/** @deprecated StartListRoundSettingsCardWithHook を使用 */
export const StartListEventPageRoundSettingsPanel = StartListRoundSettingsCardWithHook;

export { buildStartListAgeCategoryTabs };
