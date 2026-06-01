"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEventStartTimeColumnJa } from "@/lib/eventScheduleDisplay";
import { effectiveRoundStartIso } from "@/lib/eventRoundScheduledStarts";
import type { ScheduleRoundRow } from "@/lib/competitionScheduleTabDisplay";
import { parseScheduleRoundCountDraft } from "@/lib/competitionScheduleTabDisplay";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";

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
};

function PublicScheduleRowList({
  rows,
  roundCounts,
  resolveRowHref,
}: {
  rows: ScheduleRoundRow<StartListEventBarItem>[];
  roundCounts: Record<string, string>;
  resolveRowHref: (args: RowHrefArgs) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
        この日・エリアに表示する種目がありません。別の日またはエリアを選んでください。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/40">
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

        return (
          <li
            key={`${event.id}:${roundIndex}`}
            className={rowIdx % 2 === 1 ? "bg-muted/[0.04]" : undefined}
          >
            <Link
              href={rowHref}
              prefetch={false}
              className="flex min-w-0 items-stretch text-left transition hover:bg-muted/30"
            >
              <span className="flex w-[3.25rem] shrink-0 items-center justify-center border-r border-border/50 px-1 tabular-nums text-[11px] font-medium">
                {timeColumn ?? (
                  <span className="text-[10px] font-normal text-muted-foreground/70">未定</span>
                )}
              </span>
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
  scheduleTabCount,
  scheduleTabs = [],
  roundCounts,
  getRowHref,
  scheduleHintText,
}: StartListSchedulePublicViewProps) {
  const [activeDayKey, setActiveDayKey] = useState("");
  const [activeAreaTabId, setActiveAreaTabId] = useState("");

  const showDayTabs = sections.length > 1;
  const showAreaTabs = scheduleTabCount > 1 && scheduleTabs.length > 0;

  const resolvedDayKey = useMemo(() => {
    if (activeDayKey && sections.some((s) => s.dayKey === activeDayKey)) {
      return activeDayKey;
    }
    return sections[0]?.dayKey ?? "";
  }, [activeDayKey, sections]);

  const areaTabsForDisplay = useMemo(() => {
    if (!showAreaTabs) return [];
    return scheduleTabs;
  }, [showAreaTabs, scheduleTabs]);

  const resolvedAreaTabId = useMemo(() => {
    if (activeAreaTabId && areaTabsForDisplay.some((t) => t.id === activeAreaTabId)) {
      return activeAreaTabId;
    }
    return areaTabsForDisplay[0]?.id ?? "";
  }, [activeAreaTabId, areaTabsForDisplay]);

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

  return (
    <div className="divide-y divide-border/50">
      {scheduleHintText ? (
        <p className="border-b border-border/40 bg-muted/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {scheduleHintText}
        </p>
      ) : null}
      {showDayTabs ? (
        <div className="border-b border-border/40 bg-muted/[0.04] px-2.5 py-2">
          <Tabs value={resolvedDayKey} onValueChange={setActiveDayKey}>
            <TabsList className="h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 bg-muted/50 p-1">
              {sections.map((d) => (
                <TabsTrigger key={d.dayKey} value={d.dayKey} className="shrink-0 px-2 py-1 text-[11px]">
                  {d.dayLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {showAreaTabs ? (
        <div className="border-b border-border/40 bg-muted/[0.04] px-2.5 py-2">
          <Tabs value={resolvedAreaTabId} onValueChange={setActiveAreaTabId}>
            <TabsList className="h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 bg-muted/50 p-1">
              {areaTabsForDisplay.map((t) => {
                const rowCount = areaRowCountsForActiveDay[t.id] ?? 0;
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="max-w-[11rem] shrink-0 gap-1 px-2 py-1 text-left text-[11px]"
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
      <section className="py-3">
        {!showDayTabs ? (
          <h3 className="border-b border-border/40 bg-muted/10 px-2.5 py-2 text-[11px] font-semibold text-foreground">
            {dayHeading}
          </h3>
        ) : null}
        {activeSection?.isEmpty && !showAreaTabs ? (
          <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
            この日の予定はありません。
          </p>
        ) : (
          <PublicScheduleRowList
            rows={activeRows}
            roundCounts={roundCounts}
            resolveRowHref={resolveRowHref}
          />
        )}
      </section>
    </div>
  );
}
