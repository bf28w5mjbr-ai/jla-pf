"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

type RowHrefArgs = {
  eventId: string;
  roundIndex: number;
  nRounds: number;
};

type StartListSchedulePublicViewProps = {
  competitionId: string;
  sections: PublicScheduleViewSection[];
  scheduleTabCount: number;
  roundCounts: Record<string, string>;
  /** 未指定時はスタートリストへのリンク（直接URL用） */
  getRowHref?: (args: RowHrefArgs) => string;
  scheduleHintText?: string;
};

export function StartListSchedulePublicView({
  competitionId,
  sections,
  scheduleTabCount,
  roundCounts,
  getRowHref,
  scheduleHintText,
}: StartListSchedulePublicViewProps) {
  const showAreaHeadings = scheduleTabCount > 1;

  const defaultGetRowHref = ({ eventId, roundIndex, nRounds }: RowHrefArgs) =>
    nRounds > 1
      ? `/competitions/${competitionId}/start-list/${eventId}?roundIndex=${roundIndex}`
      : `/competitions/${competitionId}/start-list/${eventId}`;

  const resolveRowHref = getRowHref ?? defaultGetRowHref;

  return (
    <div className="divide-y divide-border/50">
      {scheduleHintText ? (
        <p className="border-b border-border/40 bg-muted/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {scheduleHintText}
        </p>
      ) : null}
      {sections.map((section) => (
        <section key={section.dayKey} className="py-3">
          <h3 className="border-b border-border/40 bg-muted/10 px-2.5 py-2 text-[11px] font-semibold text-foreground">
            {section.dayLabel}のタイムスケジュール
          </h3>
          {section.isEmpty ? (
            <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              この日の予定はありません。
            </p>
          ) : (
            section.areas.map((area) => (
              <div key={`${section.dayKey}:${area.tabId}`}>
                {showAreaHeadings ? (
                  <p className="border-b border-border/30 bg-muted/[0.06] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    {area.tabName}
                  </p>
                ) : null}
                <ul className="divide-y divide-border/40">
                  {area.rows.map(({ event, roundIndex, roundLabel }, rowIdx) => {
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
                    const nRounds = parseScheduleRoundCountDraft(
                      roundCounts[event.id],
                      savedRound
                    );
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
                              <span className="text-[10px] font-normal text-muted-foreground/70">
                                未定
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2">
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
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
