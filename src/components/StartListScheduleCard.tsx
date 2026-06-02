"use client";

import { useMemo, useState, type Dispatch, DragEvent, SetStateAction } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  formatEventStartTimeColumnJa,
  formatScheduleDateHeadingJa,
  scheduleDateKeyFromIso,
} from "@/lib/eventScheduleDisplay";
import { effectiveRoundStartIso, roundStartKey } from "@/lib/eventRoundScheduledStarts";
import { formatScheduleRowKey } from "@/lib/scheduleRowOrder";
import {
  filterScheduleTabsWithRows,
  resolveVisibleScheduleAreaTabId,
  type CompetitionScheduleTabLite,
  type ScheduleRoundRow,
} from "@/lib/competitionScheduleTabDisplay";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { cn } from "@/lib/utils";
import { StartListScheduleAssignBoard } from "@/components/StartListScheduleAssignBoard";
import {
  StartListSchedulePublicView,
  type PublicScheduleViewSection,
} from "@/components/StartListSchedulePublicView";
import type { CompetitionScheduleDay } from "@/lib/competitionScheduleDays";

type ScheduleCardMode = "assign" | "schedule";

export type StartListScheduleCardProps = {
  competitionId: string;
  competitionName?: string;
  hintAssignCard: string;
  hintScheduleCard: string;
  canReorder: boolean;
  canEditSchedule: boolean;
  publicScheduleBarsOnly?: boolean;
  publicScheduleSections?: PublicScheduleViewSection[];
  scheduleDayTabs?: Array<Pick<CompetitionScheduleDay, "key" | "label">>;
  competitionDays: readonly CompetitionScheduleDay[];
  resolvedActiveScheduleDayKey?: string;
  setActiveScheduleDayKey?: (key: string) => void;
  scheduleTabs: CompetitionScheduleTabLite[];
  scheduleTabBarItems: Array<{ id: string; rowCount: number }>;
  tabRowCountsAllDays?: Record<string, number>;
  resolvedActiveAreaTabId: string;
  setActiveAreaTabId: (id: string) => void;
  newTabNameDraft: string;
  setNewTabNameDraft: (v: string) => void;
  tabMutationSaving: boolean;
  reorderSaving: boolean;
  bulkApplying: boolean;
  timeSavingId: string | null;
  roundSetupBulkSaving?: boolean;
  addScheduleTab: () => void | Promise<void>;
  setDeleteTargetTabId: (id: string) => void;
  scheduleMinMax: { min?: string; max?: string };
  staggerBase: string;
  setStaggerBase: (v: string) => void;
  staggerMinutes: string;
  setStaggerMinutes: (v: string) => void;
  applyStaggerAndSave: () => void | Promise<void>;
  visibleRoundRows: ScheduleRoundRow<StartListEventBarItem>[];
  rowsByTabId: Record<string, ScheduleRoundRow<StartListEventBarItem>[]>;
  rowsByTabIdAndDay?: Record<string, Record<string, ScheduleRoundRow<StartListEventBarItem>[]>>;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  handleDropOn: (rowKey: string) => void;
  onAssignDropOn: (tabId: string, dayKey: string, targetRowKey: string | null) => void;
  assignDirty?: boolean;
  assignSaving?: boolean;
  onSaveAssign?: () => void | Promise<void | boolean>;
  onDiscardAssign?: () => void;
  onBeforeLeaveAssignMode?: () => boolean | Promise<boolean>;
  parseRoundCountDraft: (raw: string | undefined, fallback: number) => number;
  roundCounts: Record<string, string>;
  roundStarts: Record<string, string>;
  setRoundStarts: Dispatch<SetStateAction<Record<string, string>>>;
  saveRoundStart: (eventId: string, roundIndex: number) => void | Promise<void | boolean>;
  saveRoundStartOnBlur?: (eventId: string, roundIndex: number) => void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  deleteTargetTabId: string | null;
  deleteMigrateToTabId: string;
  setDeleteMigrateToTabId: (v: string) => void;
  submitDeleteTab: () => void | Promise<void>;
};

export function StartListScheduleCard(props: StartListScheduleCardProps) {
  const {
    competitionId,
    competitionName,
    hintAssignCard,
    hintScheduleCard,
    canReorder,
    canEditSchedule,
    publicScheduleBarsOnly = false,
    publicScheduleSections = [],
    scheduleDayTabs = [],
    competitionDays,
    resolvedActiveScheduleDayKey = "",
    setActiveScheduleDayKey,
    scheduleTabs,
    scheduleTabBarItems,
    tabRowCountsAllDays = {},
    resolvedActiveAreaTabId,
    setActiveAreaTabId,
    newTabNameDraft,
    setNewTabNameDraft,
    tabMutationSaving,
    reorderSaving,
    bulkApplying,
    timeSavingId,
    roundSetupBulkSaving = false,
    addScheduleTab,
    setDeleteTargetTabId,
    setDeleteOpen,
    scheduleMinMax,
    staggerBase,
    setStaggerBase,
    staggerMinutes,
    setStaggerMinutes,
    applyStaggerAndSave,
    visibleRoundRows,
    rowsByTabId,
    rowsByTabIdAndDay = {},
    dragId,
    setDragId,
    handleDropOn,
    onAssignDropOn,
    assignDirty = false,
    assignSaving = false,
    onSaveAssign,
    onDiscardAssign,
    onBeforeLeaveAssignMode,
    parseRoundCountDraft,
    roundCounts,
    roundStarts,
    setRoundStarts,
    saveRoundStartOnBlur,
    deleteOpen,
    deleteTargetTabId,
    deleteMigrateToTabId,
    setDeleteMigrateToTabId,
    submitDeleteTab,
  } = props;

  const [scheduleCardMode, setScheduleCardMode] = useState<ScheduleCardMode>("schedule");
  const [areaTabsEditMode, setAreaTabsEditMode] = useState(false);

  const effectiveMode: ScheduleCardMode = canReorder ? scheduleCardMode : "schedule";
  const modeSwitchDisabled = reorderSaving || tabMutationSaving || assignSaving;
  const hintText = effectiveMode === "assign" ? hintAssignCard : hintScheduleCard;
  const showScheduleDayTabs =
    !publicScheduleBarsOnly &&
    effectiveMode === "schedule" &&
    scheduleDayTabs.length > 0 &&
    (canReorder || canEditSchedule);
  const scheduleAreaTabsForDisplay = useMemo(
    () => filterScheduleTabsWithRows(scheduleTabs, tabRowCountsAllDays),
    [scheduleTabs, tabRowCountsAllDays]
  );

  const scheduleAreaTabId = useMemo(
    () =>
      resolveVisibleScheduleAreaTabId(
        resolvedActiveAreaTabId,
        scheduleTabs,
        tabRowCountsAllDays
      ),
    [resolvedActiveAreaTabId, scheduleTabs, tabRowCountsAllDays]
  );

  const showScheduleAreaTabs =
    !publicScheduleBarsOnly &&
    effectiveMode === "schedule" &&
    scheduleAreaTabsForDisplay.length > 1;

  const switchMode = async (mode: ScheduleCardMode) => {
    if (modeSwitchDisabled) return;
    if (mode === "schedule" && effectiveMode === "assign" && onBeforeLeaveAssignMode) {
      const ok = await onBeforeLeaveAssignMode();
      if (!ok) return;
    }
    setDragId(null);
    setScheduleCardMode(mode);
    if (mode === "schedule") {
      setAreaTabsEditMode(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="text-sm font-semibold leading-tight">タイムスケジュール</CardTitle>
              {competitionName ? (
                <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
              ) : null}
            </div>
            {canReorder ? (
              <div className="inline-flex shrink-0 rounded-lg border border-border/60 bg-muted/40 p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={effectiveMode === "assign" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-[11px]"
                  disabled={modeSwitchDisabled}
                  onClick={() => void switchMode("assign")}
                >
                  振分
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={effectiveMode === "schedule" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-[11px]"
                  disabled={modeSwitchDisabled}
                  onClick={() => void switchMode("schedule")}
                >
                  スケジュール
                </Button>
              </div>
            ) : null}
          </div>
          {hintText ? (
            <p className="text-[10px] leading-snug text-muted-foreground">{hintText}</p>
          ) : null}
          {showScheduleDayTabs && setActiveScheduleDayKey ? (
            <div className="mt-2 border-t border-border/40 pt-2">
              <Tabs value={resolvedActiveScheduleDayKey} onValueChange={setActiveScheduleDayKey}>
                <TabsList className="h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 bg-muted/50 p-1">
                  {scheduleDayTabs.map((d) => (
                    <TabsTrigger
                      key={d.key}
                      value={d.key}
                      className="shrink-0 px-2 py-1 text-[11px]"
                    >
                      {d.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
          {showScheduleAreaTabs ? (
            <div className="mt-2 border-t border-border/40 pt-2">
              <Tabs value={scheduleAreaTabId} onValueChange={setActiveAreaTabId}>
                <TabsList className="h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 bg-muted/50 p-1">
                  {scheduleAreaTabsForDisplay.map((t) => {
                    const rowCount =
                      scheduleTabBarItems.find((x) => x.id === t.id)?.rowCount ?? 0;
                    return (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="max-w-[11rem] shrink-0 gap-1 px-2 py-1 text-left text-[11px]"
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          ({rowCount})
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {publicScheduleBarsOnly ? (
            <StartListSchedulePublicView
              competitionId={competitionId}
              sections={publicScheduleSections}
              scheduleTabCount={scheduleTabs.length}
              scheduleTabs={scheduleTabs.map((t) => ({ id: t.id, name: t.name }))}
              roundCounts={roundCounts}
            />
          ) : effectiveMode === "assign" ? (
            <StartListScheduleAssignBoard
              scheduleTabs={scheduleTabs}
              competitionDays={competitionDays}
              rowsByTabIdAndDay={rowsByTabIdAndDay}
              tabRowCountsAllDays={tabRowCountsAllDays}
              tabMutationSaving={tabMutationSaving}
              assignSaving={assignSaving}
              assignDirty={assignDirty}
              onSaveAssign={onSaveAssign}
              onDiscardAssign={onDiscardAssign}
              newTabNameDraft={newTabNameDraft}
              setNewTabNameDraft={setNewTabNameDraft}
              addScheduleTab={addScheduleTab}
              areaTabsEditMode={areaTabsEditMode}
              setAreaTabsEditMode={setAreaTabsEditMode}
              setDeleteTargetTabId={setDeleteTargetTabId}
              setDeleteMigrateToTabId={setDeleteMigrateToTabId}
              setDeleteOpen={setDeleteOpen}
              dragId={dragId}
              setDragId={setDragId}
              onAssignDropOn={onAssignDropOn}
            />
          ) : (
            <>
              {canEditSchedule ? (
                <div className="border-b border-border/50 bg-muted/5 px-2.5 py-2">
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                    一括で開始時刻（表示中の日・エリアの上から順に、各行＝ラウンドごとに分刻みで保存）
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
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
                        disabled={bulkApplying || roundSetupBulkSaving || reorderSaving}
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
                        disabled={bulkApplying || roundSetupBulkSaving || reorderSaving}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void applyStaggerAndSave()}
                      disabled={
                        bulkApplying ||
                        reorderSaving ||
                        timeSavingId !== null ||
                        roundSetupBulkSaving
                      }
                    >
                      {bulkApplying ? "保存中…" : "このエリアに保存"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <ul className="divide-y divide-border/50">
                {visibleRoundRows.length === 0 ? (
                  <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                    {canReorder
                      ? "この日・エリアに表示する種目がありません。「振分」モードで行を配置してください。"
                      : scheduleAreaTabsForDisplay.length > 1
                        ? "この日・エリアに表示する種目がありません。別の日またはエリアを選んでください。"
                        : "この日に表示する種目がありません。"}
                  </li>
                ) : null}
                {visibleRoundRows.map(({ event, roundIndex, roundLabel }, rowIdx) => {
                  const rowKey = formatScheduleRowKey(event.id, roundIndex);
                  const rk = roundStartKey(event.id, roundIndex);
                  const roundIso = effectiveRoundStartIso({
                    scheduledStartAt: event.scheduledStartAt,
                    roundScheduledStarts: event.roundScheduledStarts,
                    roundIndex,
                  });
                  const timeColumn = formatEventStartTimeColumnJa(roundIso);
                  const prevRow = rowIdx > 0 ? visibleRoundRows[rowIdx - 1] : null;
                  const prevIso = prevRow
                    ? effectiveRoundStartIso({
                        scheduledStartAt: prevRow.event.scheduledStartAt,
                        roundScheduledStarts: prevRow.event.roundScheduledStarts,
                        roundIndex: prevRow.roundIndex,
                      })
                    : null;
                  const dateKey = scheduleDateKeyFromIso(roundIso);
                  const prevDateKey = scheduleDateKeyFromIso(prevIso);
                  const showDateHeading = dateKey && dateKey !== prevDateKey;
                  const dateHeading = showDateHeading ? formatScheduleDateHeadingJa(roundIso) : null;
                  const rowDrop = canReorder
                    ? {
                        onDragOver: (e: DragEvent) => {
                          if (!dragId) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        },
                        onDrop: (e: DragEvent) => {
                          e.preventDefault();
                          handleDropOn(rowKey);
                        },
                      }
                    : {};
                  const savedRound =
                    typeof event.startListRoundCount === "number" &&
                    Number.isInteger(event.startListRoundCount) &&
                    event.startListRoundCount >= 1
                      ? event.startListRoundCount
                      : 1;
                  const nRounds = parseRoundCountDraft(roundCounts[event.id], savedRound);
                  const startListHref =
                    nRounds > 1
                      ? `/competitions/${competitionId}/start-list/${event.id}?roundIndex=${roundIndex}`
                      : `/competitions/${competitionId}/start-list/${event.id}`;
                  const isSaving = timeSavingId === `${event.id}:${roundIndex}`;

                  return (
                    <li key={rowKey} className="list-none">
                      {dateHeading ? (
                        <div className="border-b border-border/40 bg-muted/10 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                          {dateHeading}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-stretch",
                          dragId === rowKey
                            ? "bg-muted/40"
                            : rowIdx % 2 === 1
                              ? "bg-muted/[0.04]"
                              : ""
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
                                setDragId(rowKey);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", rowKey);
                              }}
                              onDragEnd={() => setDragId(null)}
                              {...rowDrop}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <div
                            className={cn(
                              "flex w-[3.25rem] shrink-0 items-center justify-center border-r border-border/50 px-1 tabular-nums text-[11px]",
                              canEditSchedule ? "text-muted-foreground" : "font-medium text-foreground"
                            )}
                          >
                            {timeColumn ?? (
                              <span className="text-[10px] text-muted-foreground/70">未定</span>
                            )}
                          </div>
                          <Link
                            href={startListHref}
                            prefetch={false}
                            className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left text-sm transition hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-2"
                            {...rowDrop}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-[13px] font-medium leading-tight">
                                  {event.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="h-4 shrink-0 px-1.5 text-[9px] font-normal"
                                >
                                  {roundLabel}
                                </Badge>
                              </span>
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {sexLabelJa(event.sex)}
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
                              onBlur={() => saveRoundStartOnBlur?.(event.id, roundIndex)}
                              disabled={bulkApplying || roundSetupBulkSaving || reorderSaving}
                            />
                            {isSaving ? (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                保存中
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
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
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>エリアを削除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            このエリアを削除します。行（ラウンド）が残っている場合は、あらかじめ移動先のエリアを選んでください。
          </p>
          {deleteTargetTabId &&
          (tabRowCountsAllDays[deleteTargetTabId] ??
            scheduleTabBarItems.find((x) => x.id === deleteTargetTabId)?.rowCount ??
            0) > 0 ? (
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
}
