"use client";

import type { DragEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatScheduleRowKey } from "@/lib/scheduleRowOrder";
import {
  type CompetitionScheduleTabLite,
  type ScheduleRoundRow,
} from "@/lib/competitionScheduleTabDisplay";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import type { CompetitionScheduleDay } from "@/lib/competitionScheduleDays";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { cn } from "@/lib/utils";

export type StartListScheduleAssignBoardProps = {
  scheduleTabs: CompetitionScheduleTabLite[];
  competitionDays: readonly CompetitionScheduleDay[];
  rowsByTabIdAndDay: Record<string, Record<string, ScheduleRoundRow<StartListEventBarItem>[]>>;
  tabRowCountsAllDays: Record<string, number>;
  tabMutationSaving: boolean;
  assignSaving: boolean;
  assignDirty: boolean;
  onSaveAssign?: () => void | Promise<void | boolean>;
  onDiscardAssign?: () => void;
  newTabNameDraft: string;
  setNewTabNameDraft: (v: string) => void;
  addScheduleTab: () => void | Promise<void>;
  areaTabsEditMode: boolean;
  setAreaTabsEditMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  setDeleteTargetTabId: (id: string) => void;
  setDeleteMigrateToTabId: (v: string) => void;
  setDeleteOpen: (open: boolean) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onAssignDropOn: (tabId: string, dayKey: string, targetRowKey: string | null) => void;
};

export function StartListScheduleAssignBoard({
  scheduleTabs,
  competitionDays,
  rowsByTabIdAndDay,
  tabRowCountsAllDays,
  tabMutationSaving,
  assignSaving,
  assignDirty,
  onSaveAssign,
  onDiscardAssign,
  newTabNameDraft,
  setNewTabNameDraft,
  addScheduleTab,
  areaTabsEditMode,
  setAreaTabsEditMode,
  setDeleteTargetTabId,
  setDeleteMigrateToTabId,
  setDeleteOpen,
  dragId,
  setDragId,
  onAssignDropOn,
}: StartListScheduleAssignBoardProps) {
  const subColumnMinWidth = competitionDays.length > 1 ? "8.5rem" : "100%";

  const dndDisabled = assignSaving || tabMutationSaving;

  const columnDropHandlers = (tabId: string, dayKey: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId || dndDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onAssignDropOn(tabId, dayKey, null);
    },
  });

  const cardDropHandlers = (tabId: string, dayKey: string, rowKey: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId || dndDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onAssignDropOn(tabId, dayKey, rowKey);
    },
  });

  return (
    <div className="border-b border-border/50 px-2.5 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
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
          variant={assignDirty ? "default" : "secondary"}
          className="h-7 px-2 text-[11px]"
          onClick={() => void onSaveAssign?.()}
          disabled={!assignDirty || assignSaving || tabMutationSaving}
        >
          {assignSaving ? "保存中…" : "保存"}
        </Button>
        {assignDirty ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={() => onDiscardAssign?.()}
            disabled={assignSaving || tabMutationSaving}
          >
            変更を破棄
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          onClick={() => void addScheduleTab()}
          disabled={tabMutationSaving || assignSaving}
          aria-label="エリアを追加"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={areaTabsEditMode ? "secondary" : "outline"}
          className="h-7 shrink-0 px-2 text-[11px]"
          onClick={() => setAreaTabsEditMode((v) => !v)}
          disabled={tabMutationSaving || assignSaving}
        >
          {areaTabsEditMode ? "完了" : "編集"}
        </Button>
        {assignDirty ? (
          <span className="text-[10px] text-muted-foreground">未保存の変更あり</span>
        ) : null}
      </div>
      <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-1">
        {scheduleTabs.map((tab) => {
          const totalCount = tabRowCountsAllDays[tab.id] ?? 0;
          const byDay = rowsByTabIdAndDay[tab.id] ?? {};
          return (
            <div
              key={tab.id}
              className={cn(
                "flex min-h-[8rem] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20",
                competitionDays.length > 1 ? "min-w-[18rem]" : "w-[11rem]",
                dragId && "ring-offset-1"
              )}
            >
              <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{tab.name}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  ({totalCount})
                </span>
                {areaTabsEditMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`${tab.name} を削除`}
                    disabled={scheduleTabs.length <= 1 || tabMutationSaving}
                    onClick={() => {
                      setDeleteTargetTabId(tab.id);
                      const other = scheduleTabs.find((x) => x.id !== tab.id);
                      setDeleteMigrateToTabId(other?.id ?? "");
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              <div
                className={cn(
                  "flex flex-1 gap-1 p-1.5",
                  competitionDays.length > 1 ? "flex-row" : "flex-col"
                )}
              >
                {competitionDays.map((day) => {
                  const rows = byDay[day.key] ?? [];
                  return (
                    <div
                      key={day.key}
                      className={cn(
                        "flex min-h-[6rem] flex-1 flex-col rounded-md border border-border/40 bg-background/60",
                        competitionDays.length > 1 && "min-w-0"
                      )}
                      style={{ minWidth: competitionDays.length > 1 ? subColumnMinWidth : undefined }}
                      {...columnDropHandlers(tab.id, day.key)}
                    >
                      <div className="border-b border-border/30 px-1.5 py-1 text-center text-[10px] font-medium text-muted-foreground">
                        {day.label}
                      </div>
                      <ul className="flex flex-1 flex-col gap-1 p-1">
                        {rows.length === 0 ? (
                          <li className="px-1 py-3 text-center text-[10px] text-muted-foreground">
                            ドロップ
                          </li>
                        ) : null}
                        {rows.map(({ event, roundIndex, roundLabel }) => {
                          const rowKey = formatScheduleRowKey(event.id, roundIndex);
                          return (
                            <li key={rowKey}>
                              <div
                                className={cn(
                                  "flex items-start gap-1 rounded-md border border-border/50 bg-background px-1.5 py-1 shadow-sm",
                                  dragId === rowKey && "ring-1 ring-primary/40"
                                )}
                                {...cardDropHandlers(tab.id, day.key, rowKey)}
                              >
                                <button
                                  type="button"
                                  draggable={!dndDisabled}
                                  aria-label={`${event.name} ${sexLabelJa(event.sex)}（${roundLabel}）を移動`}
                                  className={cn(
                                    "mt-0.5 shrink-0 touch-none text-muted-foreground",
                                    dndDisabled
                                      ? "cursor-not-allowed opacity-50"
                                      : "cursor-grab active:cursor-grabbing"
                                  )}
                                  onDragStart={(e) => {
                                    setDragId(rowKey);
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", rowKey);
                                  }}
                                  onDragEnd={() => setDragId(null)}
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium leading-tight">
                                    {event.name}
                                  </p>
                                  <Badge
                                    variant="secondary"
                                    className="mt-0.5 h-4 px-1 text-[9px] font-normal"
                                  >
                                    {roundLabel}
                                  </Badge>
                                  <p className="truncate text-[10px] leading-tight text-muted-foreground">
                                    {sexLabelJa(event.sex)}
                                    {event.type === "TEAM" ? " · 団体" : " · 個人"}
                                    {event.ageCategoryName ? ` · ${event.ageCategoryName}` : ""}
                                  </p>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {assignSaving ? (
        <p className="mt-1 text-[10px] text-muted-foreground">保存中…</p>
      ) : null}
    </div>
  );
}
