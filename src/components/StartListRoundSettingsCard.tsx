"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StartListEventRoundSettingsRow } from "@/components/StartListEventRoundSettingsRow";
import { CompetitionSubheading } from "@/components/competitions/browse/competitionEditorialUi";
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
import { cn } from "@/lib/utils";

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
  chrome?: "classic" | "editorial";
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
  chrome = "classic",
}: StartListRoundSettingsCardProps) {
  const isEditorial = chrome === "editorial";
  const [expanded, setExpanded] = useState(isEditorial);
  const [allHeatExpanded, setAllHeatExpanded] = useState<boolean | undefined>(undefined);
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

  const headerButton = (
    <button
      type="button"
      className="flex w-full items-start gap-3 text-left"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {isEditorial ? (
          <>
            <CompetitionSubheading>Setup</CompetitionSubheading>
            <p className="text-base font-semibold tracking-tight text-foreground sm:text-[1.0625rem]">
              ラウンド設定
            </p>
          </>
        ) : (
          <CardTitle className="text-sm font-semibold leading-tight">ラウンド設定</CardTitle>
        )}
        {competitionName ? (
          <p
            className={cn(
              "truncate text-muted-foreground",
              isEditorial ? "text-xs" : "text-[10px]"
            )}
          >
            {competitionName}
          </p>
        ) : null}
        {!expanded && dirtyState.totalDirty > 0 ? (
          <p
            className={cn(
              "leading-snug text-amber-800 dark:text-amber-200",
              isEditorial ? "text-xs" : "text-[10px]"
            )}
          >
            未保存の変更 {dirtyState.totalDirty} 件
          </p>
        ) : null}
      </div>
      <ChevronDown
        className={cn(
          "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
          expanded && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  );

  const expandedHints = expanded ? (
    <>
      {scheduleLabel ? (
        <p
          className={cn(
            "leading-snug text-muted-foreground",
            isEditorial ? "text-xs" : "text-[10px]"
          )}
        >
          進行予定: {scheduleLabel}
        </p>
      ) : null}
      <p
        className={cn(
          "leading-relaxed text-muted-foreground",
          isEditorial ? "text-xs" : "text-[10px] leading-snug"
        )}
      >
        {hintText ?? defaultHint}
      </p>
      {focusEventId && visibleEvents[0]?.startListHeatPlanConfirmedAt ? (
        <p
          className={cn(
            "leading-relaxed text-amber-900 dark:text-amber-100",
            isEditorial ? "text-xs" : "mt-1 text-[10px] leading-snug"
          )}
        >
          ヒート・レーンは確定済みですが、内容を変えて再保存できます。保存するとスタートリスト記録（公開・マーシャル）も更新されます。2ラウンド目以降は進出者未確定の試算（枠のみ）です。マーシャル締切済みのラウンドは編集できません。
        </p>
      ) : null}
    </>
  ) : null;

  const ageCategoryTabsUi =
    ageCategoryTabs && ageCategoryTabs.length > 1 && activeAgeCategoryTab && onAgeCategoryTabChange ? (
      <div
        className={cn(
          "border-b border-border/45",
          isEditorial ? "bg-muted/10 px-4 py-3 sm:px-5" : "bg-muted/10 px-2.5 py-1.5"
        )}
      >
        <Tabs value={activeAgeCategoryTab} onValueChange={onAgeCategoryTabChange}>
          <TabsList
            className={cn(
              "flex h-auto w-full flex-wrap justify-start gap-1",
              isEditorial
                ? "rounded-xl border border-border/50 bg-background/80 p-1"
                : "gap-0.5 bg-muted/50 p-0.5"
            )}
          >
            {ageCategoryTabs.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] data-[state=active]:shadow-sm",
                  isEditorial && "data-[state=active]:bg-background"
                )}
              >
                {t.label}
                <span className="ml-1 tabular-nums text-muted-foreground">({t.count})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    ) : null;

  const eventRows = (
    <ul
      className={cn(
        isEditorial ? "divide-y divide-border/45" : "divide-y divide-border/50",
        isEditorial && visibleEvents.length > 4 && "max-h-[min(70vh,640px)] overflow-y-auto"
      )}
    >
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
            onRoundCountChange={(value) => setRoundCounts((p) => ({ ...p, [event.id]: value }))}
            heatUiLocked={heatUiLocked}
            onUpdateHeatTab={(tabIdx, patch) => updateHeatTab(event.id, tabIdx, patch)}
            isDirty={dirtyEventIds.has(event.id)}
            chrome={chrome}
            forceHeatExpanded={allHeatExpanded}
            onManualHeatToggle={() => setAllHeatExpanded(undefined)}
          />
        );
      })}
    </ul>
  );

  const footer = (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border/45 bg-muted/10 sm:flex-row sm:items-center sm:justify-between",
        isEditorial ? "px-4 py-3 sm:px-5" : "gap-1.5 px-2.5 py-2",
        contentStatusClassName
      )}
    >
      <div
        className={cn(
          "leading-snug text-muted-foreground",
          isEditorial ? "text-xs" : "text-[10px]"
        )}
      >
        {dirtyState.totalDirty > 0 ? (
          <>
            変更 {dirtyState.totalDirty} 件
            {dirtyState.roundDirty.length > 0 ? ` · ラウンド ${dirtyState.roundDirty.length}` : ""}
            {dirtyState.heatDirty.length > 0 ? ` · ヒート ${dirtyState.heatDirty.length}` : ""}
          </>
        ) : (
          "変更はありません"
        )}
        {dirtyState.marshalRoundBlocked.length > 0 ? (
          <span className="mt-1 block text-amber-700 dark:text-amber-300">
            マーシャル締切済みのラウンドは変更できません
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant={isEditorial ? "default" : "secondary"}
        className={cn(
          "h-8 shrink-0 px-3 text-[11px]",
          isEditorial && "rounded-lg shadow-sm"
        )}
        onClick={() => void saveAllRoundSettings(visibleEvents)}
        disabled={bulkSaveDisabled}
      >
        {bulkSaving ? "一括保存中…" : "一括保存"}
      </Button>
    </div>
  );

  const collapsedSave =
    !expanded && dirtyState.totalDirty > 0 ? (
      <div className="flex items-center justify-end pt-2">
        <Button
          type="button"
          size="sm"
          variant={isEditorial ? "default" : "secondary"}
          className={cn("h-7 px-2.5 text-[11px]", isEditorial && "rounded-lg shadow-sm")}
          onClick={() => void saveAllRoundSettings(visibleEvents)}
          disabled={bulkSaveDisabled}
        >
          {bulkSaving ? "一括保存中…" : "一括保存"}
        </Button>
      </div>
    ) : null;

  if (isEditorial) {
    return (
      <section className="overflow-hidden rounded-2xl border border-border/50 bg-muted/10">
        <div
          className={cn(
            "border-b border-border/45 bg-background/40 px-3 py-3 sm:px-4",
            !expanded && "border-b-transparent"
          )}
        >
          {headerButton}
          {expanded ? <div className="mt-3 space-y-2">{expandedHints}</div> : null}
          {collapsedSave}
        </div>
        {expanded ? (
          <>
            {ageCategoryTabsUi}
            {isEditorial && visibleEvents.length > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground sm:px-4">
                <span>{visibleEvents.length} 種目</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="font-medium text-foreground/75 transition-colors hover:text-foreground"
                    onClick={() => setAllHeatExpanded(true)}
                  >
                    ヒートをすべて開く
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    className="font-medium text-foreground/75 transition-colors hover:text-foreground"
                    onClick={() => setAllHeatExpanded(false)}
                  >
                    すべて閉じる
                  </button>
                </div>
              </div>
            ) : null}
            {eventRows}
            {footer}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader
        className={cn(
          "space-y-0.5 bg-muted/15",
          expanded ? "border-b border-border/80" : "border-b border-transparent",
          headerClassName
        )}
      >
        {headerButton}
        {expanded ? expandedHints : null}
        {collapsedSave}
      </CardHeader>
      {expanded ? (
        <CardContent className="p-0">
          {ageCategoryTabsUi}
          {eventRows}
          {footer}
        </CardContent>
      ) : null}
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
  chrome?: "classic" | "editorial";
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
  chrome = "classic",
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
      chrome={chrome}
      headerClassName="px-3 py-2 sm:px-4"
      contentStatusClassName="px-3 sm:px-4"
    />
  );
}

export { buildStartListAgeCategoryTabs };
