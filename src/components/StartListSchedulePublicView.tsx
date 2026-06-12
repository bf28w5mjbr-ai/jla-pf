"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEventStartTimeColumnJa } from "@/lib/eventScheduleDisplay";
import { effectiveRoundStartIso } from "@/lib/eventRoundScheduledStarts";
import {
  filterScheduleTabsWithRows,
  parseScheduleRoundCountDraft,
  resolveVisibleScheduleAreaTabId,
  type ScheduleRoundRow,
} from "@/lib/competitionScheduleTabDisplay";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { cn } from "@/lib/utils";

export type PublicScheduleViewSection = {
  dayKey: string;
  dayLabel: string;
  isEmpty: boolean;
  areas: Array<{
    tabId: string;
    tabName: string;
    rows: ScheduleRoundRow<StartListEventBarItem>[];
  }>;
};

export type PublicScheduleTabLite = {
  id: string;
  name: string;
};

type RowHrefArgs = {
  eventId: string;
  roundIndex: number;
  nRounds: number;
};

type StartListSchedulePublicViewProps = {
  competitionId: string;
  sections: PublicScheduleViewSection[];
  scheduleTabCount: number;
  /** エリアタブの表示順・ラベル（複数エリア時） */
  scheduleTabs?: PublicScheduleTabLite[];
  roundCounts: Record<string, string>;
  /** 未指定時はスタートリストへのリンク（直接URL用） */
  getRowHref?: (args: RowHrefArgs) => string;
  scheduleHintText?: string;
  chrome?: "classic" | "editorial";
};

function PublicScheduleRowList({
  rows,
  roundCounts,
  resolveRowHref,
  chrome = "classic",
}: {
  rows: ScheduleRoundRow<StartListEventBarItem>[];
  roundCounts: Record<string, string>;
  resolveRowHref: (args: RowHrefArgs) => string;
  chrome?: "classic" | "editorial";
}) {
  const isEditorial = chrome === "editorial";

  if (rows.length === 0) {
    return (
      <p
        className={cn(
          "text-center text-muted-foreground",
          isEditorial ? "px-4 py-8 text-xs" : "px-2.5 py-6 text-xs"
        )}
      >
        この日・エリアに表示する種目がありません。別の日またはエリアを選んでください。
      </p>
    );
  }

  return (
    <ul
      className={cn(
        "divide-y divide-border/40",
        isEditorial && rows.length > 8 && "max-h-[min(70vh,640px)] overflow-y-auto"
      )}
    >
      {rows.map(({ event, roundIndex, roundLabel }, rowIdx) => {
        const roundIso = effectiveRoundStartIso({
          scheduledStartAt: event.scheduledStartAt,
          roundScheduledStarts: event.roundScheduledStarts,
          roundIndex,
        });
        const timeColumn = formatEventStartTimeColumnJa(roundIso);
        const savedRound =
          typeof event.startListRoundCount === "number" &&
          Number.isInteger(event.startListRoundCount) &&
          event.startListRoundCount >= 1
            ? event.startListRoundCount
            : 1;
        const nRounds = parseScheduleRoundCountDraft(roundCounts[event.id], savedRound);
        const rowHref = resolveRowHref({
          eventId: event.id,
          roundIndex,
          nRounds,
        });

        const inlineMeta = [
          sexLabelJa(event.sex),
          event.type === "TEAM" ? "団体" : "個人",
          ...(event.ageCategoryName ? [event.ageCategoryName] : []),
        ].join(" · ");

        return (
          <li
            key={`${event.id}:${roundIndex}`}
            className={!isEditorial && rowIdx % 2 === 1 ? "bg-muted/[0.04]" : undefined}
          >
            <Link
              href={rowHref}
              prefetch={false}
              className={cn(
                "flex min-w-0 items-stretch text-left transition hover:bg-muted/30",
                isEditorial && "group"
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center border-r border-border/50 px-1 tabular-nums font-medium",
                  isEditorial ? "w-11 text-xs" : "w-[3.25rem] text-[11px]"
                )}
              >
                {timeColumn ?? (
                  <span className="text-[10px] font-normal text-muted-foreground/70">未定</span>
                )}
              </span>
              {isEditorial ? (
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2 sm:px-4">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium leading-tight text-foreground">
                      {event.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-border/55 bg-muted/20 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {roundLabel}
                    </span>
                  </span>
                  <span className="truncate text-[10px] leading-tight text-muted-foreground">
                    {inlineMeta}
                  </span>
                </span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium leading-tight">
                        {event.name}
                      </span>
                      <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[9px] font-normal">
                        {roundLabel}
                      </Badge>
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {sexLabelJa(event.sex)}
                    {event.type === "TEAM" ? " · 団体" : " · 個人"}
                    {event.ageCategoryName ? ` · ${event.ageCategoryName}` : ""}
                  </span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function StartListSchedulePublicView({
  competitionId,
  sections,
  scheduleTabs = [],
  roundCounts,
  getRowHref,
  scheduleHintText,
  chrome = "classic",
}: StartListSchedulePublicViewProps) {
  const isEditorial = chrome === "editorial";
  const [activeDayKey, setActiveDayKey] = useState("");
  const [activeAreaTabId, setActiveAreaTabId] = useState("");

  const showDayTabs = sections.length > 1;

  const tabRowCountsAllDays = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const section of sections) {
      for (const area of section.areas) {
        counts[area.tabId] = (counts[area.tabId] ?? 0) + area.rows.length;
      }
    }
    return counts;
  }, [sections]);

  const areaTabsForDisplay = useMemo(
    () => filterScheduleTabsWithRows(scheduleTabs, tabRowCountsAllDays),
    [scheduleTabs, tabRowCountsAllDays]
  );

  const showAreaTabs = areaTabsForDisplay.length > 1;

  const resolvedDayKey = useMemo(() => {
    if (activeDayKey && sections.some((s) => s.dayKey === activeDayKey)) {
      return activeDayKey;
    }
    return sections[0]?.dayKey ?? "";
  }, [activeDayKey, sections]);

  const resolvedAreaTabId = useMemo(() => {
    if (!showAreaTabs) return "";
    return resolveVisibleScheduleAreaTabId(
      activeAreaTabId,
      areaTabsForDisplay,
      tabRowCountsAllDays
    );
  }, [activeAreaTabId, areaTabsForDisplay, showAreaTabs, tabRowCountsAllDays]);

  useEffect(() => {
    const first = sections[0]?.dayKey ?? "";
    if (!first) return;
    if (!activeDayKey || !sections.some((s) => s.dayKey === activeDayKey)) {
      setActiveDayKey(first);
    }
  }, [activeDayKey, sections]);

  useEffect(() => {
    const first = areaTabsForDisplay[0]?.id ?? "";
    if (!first) return;
    if (!activeAreaTabId || !areaTabsForDisplay.some((t) => t.id === activeAreaTabId)) {
      setActiveAreaTabId(first);
    }
  }, [activeAreaTabId, areaTabsForDisplay]);

  const activeSection = useMemo(
    () => sections.find((s) => s.dayKey === resolvedDayKey),
    [sections, resolvedDayKey]
  );

  const areaRowCountsForActiveDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const area of activeSection?.areas ?? []) {
      counts[area.tabId] = area.rows.length;
    }
    return counts;
  }, [activeSection]);

  const activeRows = useMemo(() => {
    if (!activeSection) return [];
    if (!showAreaTabs) {
      return activeSection.areas.flatMap((a) => a.rows);
    }
    const area = activeSection.areas.find((a) => a.tabId === resolvedAreaTabId);
    return area?.rows ?? [];
  }, [activeSection, showAreaTabs, resolvedAreaTabId]);

  const defaultGetRowHref = ({ eventId, roundIndex, nRounds }: RowHrefArgs) =>
    nRounds > 1
      ? `/competitions/${competitionId}/start-list/${eventId}?roundIndex=${roundIndex}`
      : `/competitions/${competitionId}/start-list/${eventId}`;

  const resolveRowHref = getRowHref ?? defaultGetRowHref;

  const dayHeading = activeSection?.dayLabel
    ? `${activeSection.dayLabel}のタイムスケジュール`
    : "タイムスケジュール";

  const tabsListClass = cn(
    "h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1",
    isEditorial
      ? "rounded-xl border border-border/50 bg-background/80 p-1"
      : "bg-muted/50 p-1"
  );
  const tabsTriggerClass = cn(
    "shrink-0 px-2 py-1 text-[11px]",
    isEditorial && "rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
  );

  return (
    <div className="divide-y divide-border/50">
      {scheduleHintText ? (
        <p
          className={cn(
            "border-b border-border/40 bg-muted/[0.04] leading-relaxed text-muted-foreground",
            isEditorial ? "px-3 py-2 text-xs sm:px-4" : "px-2.5 py-2 text-[10px]"
          )}
        >
          {scheduleHintText}
        </p>
      ) : null}
      {showDayTabs ? (
        <div
          className={cn(
            "border-b border-border/40 bg-muted/[0.04]",
            isEditorial ? "px-3 py-2 sm:px-4" : "px-2.5 py-2"
          )}
        >
          <Tabs value={resolvedDayKey} onValueChange={setActiveDayKey}>
            <TabsList className={tabsListClass}>
              {sections.map((d) => (
                <TabsTrigger key={d.dayKey} value={d.dayKey} className={tabsTriggerClass}>
                  {d.dayLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {showAreaTabs ? (
        <div
          className={cn(
            "border-b border-border/40 bg-muted/[0.04]",
            isEditorial ? "px-3 py-2 sm:px-4" : "px-2.5 py-2"
          )}
        >
          <Tabs value={resolvedAreaTabId} onValueChange={setActiveAreaTabId}>
            <TabsList className={tabsListClass}>
              {areaTabsForDisplay.map((t) => {
                const rowCount = areaRowCountsForActiveDay[t.id] ?? 0;
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className={cn(tabsTriggerClass, "max-w-[11rem] gap-1 text-left")}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">({rowCount})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {isEditorial && activeRows.length > 0 ? (
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground sm:px-4">
          <span>{activeRows.length} 行</span>
        </div>
      ) : null}
      <section className={isEditorial ? "py-0" : "py-3"}>
        {!showDayTabs ? (
          <h3
            className={cn(
              "border-b border-border/40 bg-muted/10 font-semibold text-foreground",
              isEditorial ? "px-3 py-2 text-xs sm:px-4" : "px-2.5 py-2 text-[11px]"
            )}
          >
            {dayHeading}
          </h3>
        ) : null}
        {activeSection?.isEmpty && !showAreaTabs ? (
          <p
            className={cn(
              "text-center text-muted-foreground",
              isEditorial ? "px-4 py-6 text-xs" : "px-2.5 py-4 text-xs"
            )}
          >
            この日の予定はありません。
          </p>
        ) : (
          <PublicScheduleRowList
            rows={activeRows}
            roundCounts={roundCounts}
            resolveRowHref={resolveRowHref}
            chrome={chrome}
          />
        )}
      </section>
    </div>
  );
}
