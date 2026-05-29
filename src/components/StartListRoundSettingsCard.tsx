"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
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
import { parseStartListSettings } from "@/lib/startListSettings";

type AgeCategoryTab = { key: string; label: string; count: number };

type StartListRoundSettingsCardProps = {
  competitionName?: string;
  events: StartListEventBarItem[];
  draft: StartListRoundHeatDraftControls;
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
    bulkSaving,
    buildRoundTabsForEvent,
    getDirtyState,
    updateHeatTab,
    saveAllRoundSettings,
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

  const dirtyState = useMemo(
    () => getDirtyState(visibleEvents),
    [getDirtyState, visibleEvents]
  );

  if (visibleEvents.length === 0) return null;

  const defaultHint =
    "ラウンド数・ヒート数・最大レーンを入力し、下部の「一括保存」で確定します。空欄の最大レーンは種目の既定レーン数が使われます。";

  const heatUiLocked = extraHeatUiLocked || bulkSaving;
  const bulkSaveDisabled =
    heatUiLocked || dirtyState.totalDirty === 0 || dirtyState.marshalRoundBlocked.length > 0;

  const dirtyEventIds = new Set([
    ...dirtyState.roundDirty.map((e) => e.id),
    ...dirtyState.heatDirty.map((e) => e.id),
  ]);

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
            ヒート・レーンは確定済みですが、内容を変えて再保存できます。保存するとスタートリスト記録（公開・マーシャル）も更新されます。2ラウンド目以降は進出者未確定の試算（枠のみ）です。マーシャル締切済みのラウンドは編集できません。
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
            const displayTabs = buildRoundTabsForEvent(event);
            return (
              <StartListEventRoundSettingsRow
                key={event.id}
                event={event}
                scheduleText={scheduleText}
                displayTabs={displayTabs}
                roundCountValue={roundCounts[event.id] ?? "1"}
                onRoundCountChange={(value) =>
                  setRoundCounts((p) => ({ ...p, [event.id]: value }))
                }
                heatUiLocked={heatUiLocked}
                onUpdateHeatTab={(tabIdx, patch) => updateHeatTab(event.id, tabIdx, patch)}
                isDirty={dirtyEventIds.has(event.id)}
              />
            );
          })}
        </ul>
        <div
          className={`flex flex-col gap-1.5 border-t border-border/50 bg-muted/10 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between ${contentStatusClassName}`}
        >
          <div className="text-[10px] leading-snug text-muted-foreground">
            {dirtyState.totalDirty > 0 ? (
              <>
                変更 {dirtyState.totalDirty} 件
                {dirtyState.roundDirty.length > 0
                  ? ` · ラウンド ${dirtyState.roundDirty.length}`
                  : ""}
                {dirtyState.heatDirty.length > 0 ? ` · ヒート ${dirtyState.heatDirty.length}` : ""}
              </>
            ) : (
              "変更はありません"
            )}
            {dirtyState.marshalRoundBlocked.length > 0 ? (
              <span className="mt-0.5 block text-amber-700 dark:text-amber-300">
                マーシャル締切済みのラウンドは変更できません
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 px-3 text-[11px]"
            onClick={() => void saveAllRoundSettings(visibleEvents)}
            disabled={bulkSaveDisabled}
          >
            {bulkSaving ? "一括保存中…" : "一括保存"}
          </Button>
        </div>
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

  return (
    <StartListRoundSettingsCard
      competitionName={competitionName}
      events={barItems}
      draft={draft}
      focusEventId={focusEventId}
      scheduleLabel={scheduleLabel}
      hintText={hintText}
      headerClassName="px-3 py-2 sm:px-4"
      contentStatusClassName="px-3 sm:px-4"
    />
  );
}

export { buildStartListAgeCategoryTabs };
