"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { isMarshalRoundLocked } from "@/lib/marshalRoundSettingsLock";
import type { StartListRoundTab } from "@/lib/startListSettings";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { cn } from "@/lib/utils";

export type StartListEventRoundSettingsRowProps = {
  event: StartListEventBarItem;
  scheduleText: string | null;
  displayTabs: StartListRoundTab[];
  roundCountValue: string;
  onRoundCountChange: (value: string) => void;
  heatUiLocked: boolean;
  onUpdateHeatTab: (tabIndex: number, patch: Partial<StartListRoundTab>) => void;
  isDirty?: boolean;
  chrome?: "classic" | "editorial";
  forceHeatExpanded?: boolean;
  onManualHeatToggle?: () => void;
};

const compactInputClass =
  "h-7 w-11 px-1 text-center text-[11px] tabular-nums";
const editorialInputClass =
  "h-7 w-10 rounded-md border-border/55 bg-background px-1 text-center text-[11px] tabular-nums";

export function StartListEventRoundSettingsRow({
  event,
  scheduleText,
  displayTabs,
  roundCountValue,
  onRoundCountChange,
  heatUiLocked,
  onUpdateHeatTab,
  isDirty = false,
  chrome = "classic",
  forceHeatExpanded,
  onManualHeatToggle,
}: StartListEventRoundSettingsRowProps) {
  const isEditorial = chrome === "editorial";
  const [heatExpanded, setHeatExpanded] = useState(isDirty);

  useEffect(() => {
    if (forceHeatExpanded !== undefined) {
      setHeatExpanded(forceHeatExpanded);
    }
  }, [forceHeatExpanded]);
  const roundCount = parseInt(roundCountValue, 10);
  const effectiveRoundCount =
    Number.isInteger(roundCount) && roundCount >= 1 && roundCount <= 32 ? roundCount : 1;
  const roundCountLocked = (event.marshalLockedRounds?.length ?? 0) > 0;

  const entryMeta =
    typeof event.preliminaryHeatLaneCount === "number"
      ? `${event.entryCount ?? 0}件 · L${event.preliminaryHeatLaneCount}`
      : `${event.entryCount ?? 0}件`;

  const inlineMeta = [
    sexLabelJa(event.sex),
    event.type === "TEAM" ? "団体" : "個人",
    ...(event.ageCategoryName ? [event.ageCategoryName] : []),
    entryMeta,
    ...(scheduleText ? [scheduleText] : []),
  ].join(" · ");

  const hasHeatPanel = displayTabs.length >= 1;

  if (isEditorial) {
    return (
      <li
        className={cn(
          "relative",
          isDirty && "bg-amber-50/25 dark:bg-amber-950/10",
          isDirty &&
            "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-amber-500/75"
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          {hasHeatPanel ? (
            <button
              type="button"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              onClick={() => {
                onManualHeatToggle?.();
                setHeatExpanded((v) => !v);
              }}
              aria-expanded={heatExpanded}
              aria-label={`${event.name} のヒート構成を${heatExpanded ? "閉じる" : "開く"}`}
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform duration-200", heatExpanded && "rotate-180")}
                aria-hidden
              />
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium leading-tight text-foreground">{event.name}</p>
            <p className="truncate text-[10px] leading-tight text-muted-foreground">{inlineMeta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">R</span>
            <Input
              numericInput="integer"
              min={1}
              max={32}
              className={editorialInputClass}
              aria-label={`${event.name} のスタートリストのラウンド数`}
              value={roundCountValue}
              onChange={(e) => onRoundCountChange(e.target.value)}
              disabled={heatUiLocked || roundCountLocked}
            />
          </div>
        </div>
        {hasHeatPanel && heatExpanded ? (
          <div className="border-t border-border/40 bg-muted/5 px-3 py-1.5 sm:px-4">
            <ul className="divide-y divide-border/35">
              {displayTabs.map((tab, tabIdx) => {
                const tabLocked = isMarshalRoundLocked(
                  event.marshalLockedRounds,
                  tabIdx,
                  effectiveRoundCount
                );
                const roundLabel = tab.label?.trim() ? tab.label : `R${tabIdx + 1}`;
                return (
                  <li
                    key={tab.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 first:pt-0 last:pb-0"
                  >
                    <span className="w-[4.5rem] shrink-0 truncate text-[10px] font-medium text-foreground">
                      {roundLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">H</span>
                    <Input
                      numericInput="integer"
                      min={1}
                      max={64}
                      className={cn(compactInputClass, editorialInputClass, "w-10")}
                      value={tab.heatCount ?? "1"}
                      onChange={(e) =>
                        onUpdateHeatTab(tabIdx, { heatCount: e.target.value, mode: "count" })
                      }
                      disabled={heatUiLocked || tabLocked}
                    />
                    <span className="text-[10px] text-muted-foreground">L</span>
                    <Input
                      numericInput="integer"
                      min={1}
                      title="最大レーン（空なら種目の既定）"
                      placeholder={
                        typeof event.preliminaryHeatLaneCount === "number"
                          ? String(event.preliminaryHeatLaneCount)
                          : "—"
                      }
                      className={cn(compactInputClass, editorialInputClass, "w-11")}
                      value={
                        typeof tab.maxLanesPerHeat === "number" ? String(tab.maxLanesPerHeat) : ""
                      }
                      onChange={(e) => {
                        const t = e.target.value.trim();
                        if (t === "") {
                          onUpdateHeatTab(tabIdx, { maxLanesPerHeat: undefined });
                          return;
                        }
                        const v = parseInt(t, 10);
                        if (Number.isInteger(v) && v >= 1 && Number.isSafeInteger(v)) {
                          onUpdateHeatTab(tabIdx, { maxLanesPerHeat: v });
                        }
                      }}
                      disabled={heatUiLocked || tabLocked}
                    />
                  </li>
                );
              })}
            </ul>
            {event.startListHeatPlanConfirmedAt ? (
              <p className="mt-1 text-[10px] text-muted-foreground">確定済み</p>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li
      className={cn(
        "relative flex flex-col",
        isDirty && "bg-amber-50/40 dark:bg-amber-950/10"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-0 px-2 py-1 text-left text-sm sm:flex-row sm:items-center sm:gap-2 sm:py-1">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">{event.name}</span>
            {scheduleText ? (
              <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                {scheduleText}
              </span>
            ) : null}
            <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
              {typeof event.preliminaryHeatLaneCount === "number"
                ? `エントリー ${event.entryCount ?? 0} 件 · 最大レーン ${event.preliminaryHeatLaneCount}`
                : `エントリー ${event.entryCount ?? 0} 件`}
            </span>
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {sexLabelJa(event.sex)}
            {event.type === "TEAM" ? " · 団体" : " · 個人"}
            {event.ageCategoryName ? ` · ${event.ageCategoryName}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1 sm:w-auto sm:border-l sm:border-t-0 sm:py-1 sm:pl-2 sm:pr-2">
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">ラウンド</span>
          <Input
            numericInput="integer"
            min={1}
            max={32}
            className={compactInputClass}
            aria-label={`${event.name} のスタートリストのラウンド数`}
            value={roundCountValue}
            onChange={(e) => onRoundCountChange(e.target.value)}
            disabled={heatUiLocked || roundCountLocked}
          />
        </div>
      </div>
      {hasHeatPanel ? (
        <div className="border-t border-border/50 bg-muted/5 px-2 py-1.5">
          <p className="mb-1 text-[10px] leading-snug text-muted-foreground">
            ラウンドごとのヒート数・最大レーン（空の最大レーンは種目の既定）
          </p>
          <ul className="divide-y divide-border/40">
            {displayTabs.map((tab, tabIdx) => {
              const tabLocked = isMarshalRoundLocked(
                event.marshalLockedRounds,
                tabIdx,
                effectiveRoundCount
              );
              return (
                <li
                  key={tab.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 first:pt-0 last:pb-0"
                >
                  <span className="w-[6.5rem] shrink-0 truncate text-[10px] font-medium text-foreground">
                    {tab.label?.trim() ? tab.label : `ラウンド ${tabIdx + 1}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">ヒート数</span>
                  <Input
                    numericInput="integer"
                    min={1}
                    max={64}
                    className={compactInputClass}
                    value={tab.heatCount ?? "1"}
                    onChange={(e) =>
                      onUpdateHeatTab(tabIdx, { heatCount: e.target.value, mode: "count" })
                    }
                    disabled={heatUiLocked || tabLocked}
                  />
                  <span className="text-[10px] text-muted-foreground">最大レーン</span>
                  <Input
                    numericInput="integer"
                    min={1}
                    title="最大レーン（空なら種目の既定）"
                    placeholder={
                      typeof event.preliminaryHeatLaneCount === "number"
                        ? String(event.preliminaryHeatLaneCount)
                        : "—"
                    }
                    className="h-7 w-14 px-1 text-center text-[11px] tabular-nums"
                    value={
                      typeof tab.maxLanesPerHeat === "number" ? String(tab.maxLanesPerHeat) : ""
                    }
                    onChange={(e) => {
                      const t = e.target.value.trim();
                      if (t === "") {
                        onUpdateHeatTab(tabIdx, { maxLanesPerHeat: undefined });
                        return;
                      }
                      const v = parseInt(t, 10);
                      if (Number.isInteger(v) && v >= 1 && Number.isSafeInteger(v)) {
                        onUpdateHeatTab(tabIdx, { maxLanesPerHeat: v });
                      }
                    }}
                    disabled={heatUiLocked || tabLocked}
                  />
                </li>
              );
            })}
          </ul>
          {event.startListHeatPlanConfirmedAt ? (
            <p className="mt-1 text-[10px] text-muted-foreground">ヒート・レーン確定済み</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
