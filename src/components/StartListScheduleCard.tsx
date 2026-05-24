"use client";

import type { Dispatch, DragEvent, SetStateAction } from "react";
import Link from "next/link";
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
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";
import { effectiveRoundStartIso, roundStartKey } from "@/lib/eventRoundScheduledStarts";
import {
  type CompetitionScheduleTabLite,
  type ScheduleRoundRow,
} from "@/lib/competitionScheduleTabDisplay";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { cn } from "@/lib/utils";

export type StartListScheduleCardProps = {
  competitionId: string;
  competitionName?: string;
  hintEventListCard: string;
  canReorder: boolean;
  canEditSchedule: boolean;
  scheduleTabs: CompetitionScheduleTabLite[];
  scheduleTabBarItems: Array<{ id: string; eventCount: number }>;
  resolvedActiveAreaTabId: string;
  setActiveAreaTabId: (id: string) => void;
  newTabNameDraft: string;
  setNewTabNameDraft: (v: string) => void;
  tabMutationSaving: boolean;
  reorderSaving: boolean;
  bulkApplying: boolean;
  timeSavingId: string | null;
  roundSavingId: string | null;
  heatSavingEventId: string | null;
  heatPlanConfirmingId: string | null;
  autoSortAfterSaveStart: boolean;
  setAutoSortPreference: (enabled: boolean) => void;
  handleSortByStartTime: () => void | Promise<void>;
  addScheduleTab: () => void | Promise<void>;
  setRenameTargetTabId: (id: string) => void;
  setDeleteTargetTabId: (id: string) => void;
  shiftActiveScheduleTab: (delta: -1 | 1) => void | Promise<void>;
  scheduleMinMax: { min?: string; max?: string };
  staggerBase: string;
  setStaggerBase: (v: string) => void;
  staggerMinutes: string;
  setStaggerMinutes: (v: string) => void;
  applyStaggerAndSave: () => void | Promise<void>;
  visibleRoundRows: ScheduleRoundRow<StartListEventBarItem>[];
  dragId: string | null;
  setDragId: (id: string | null) => void;
  handleDropOn: (eventId: string) => void;
  parseRoundCountDraft: (raw: string | undefined) => number;
  roundCounts: Record<string, string>;
  roundStarts: Record<string, string>;
  setRoundStarts: Dispatch<SetStateAction<Record<string, string>>>;
  saveRoundStart: (eventId: string, roundIndex: number) => void | Promise<void>;
  moveEventToScheduleTab: (eventId: string, tabId: string) => void | Promise<void>;
  renameOpen: boolean;
  setRenameOpen: (open: boolean) => void;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  submitRenameTab: () => void | Promise<void>;
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
    hintEventListCard,
    canReorder,
    canEditSchedule,
    scheduleTabs,
    scheduleTabBarItems,
    resolvedActiveAreaTabId,
    setActiveAreaTabId,
    newTabNameDraft,
    setNewTabNameDraft,
    tabMutationSaving,
    reorderSaving,
    bulkApplying,
    timeSavingId,
    roundSavingId,
    heatSavingEventId,
    heatPlanConfirmingId,
    autoSortAfterSaveStart,
    setAutoSortPreference,
    handleSortByStartTime,
    addScheduleTab,
    setRenameTargetTabId,
    setRenameDraft,
    setRenameOpen,
    setDeleteTargetTabId,
    setDeleteOpen,
    shiftActiveScheduleTab,
    scheduleMinMax,
    staggerBase,
    setStaggerBase,
    staggerMinutes,
    setStaggerMinutes,
    applyStaggerAndSave,
    visibleRoundRows,
    dragId,
    setDragId,
    handleDropOn,
    parseRoundCountDraft,
    roundCounts,
    roundStarts,
    setRoundStarts,
    saveRoundStart,
    moveEventToScheduleTab,
    renameOpen,
    renameDraft,
    submitRenameTab,
    deleteOpen,
    deleteTargetTabId,
    deleteMigrateToTabId,
    setDeleteMigrateToTabId,
    submitDeleteTab,
  } = props;

  return (
    <>
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
}
