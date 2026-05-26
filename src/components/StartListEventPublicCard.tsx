"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildStartListEventRoundDisplay,
  formatStartListTabLabelWithHeatCount,
  snapshotRoundForTab,
} from "@/lib/startListEventTabDisplay";
import { LiveRoundContent } from "@/components/StartListRoundListPanels";
import type { StartListEventCardProps } from "@/lib/startListEventTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";

export default function StartListEventPublicCard({
  competitionName,
  archiveRecordedAtIso,
  event,
  scheduleLabel,
  individuals,
  teams,
  initialSettings,
  officialRanksByRound,
  placementSeed,
  frozenSnapshotRounds,
  initialParticipantStatusRows,
  participantStatusByKey,
  softRefreshIntervalSec,
}: StartListEventCardProps) {
  const router = useRouter();
  const eventId = event.id;
  const isTeam = event.type === "TEAM";
  const total = isTeam ? teams.length : individuals.length;

  useEffect(() => {
    const sec = softRefreshIntervalSec;
    if (sec == null || sec < 15) return;
    const ms = Math.min(sec * 1000, 120_000);
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    }, ms);
    return () => window.clearInterval(id);
  }, [softRefreshIntervalSec, router]);

  const roundDisplay = useMemo(
    () =>
      buildStartListEventRoundDisplay({
        eventId,
        initialSettings,
        startListRoundCount: event.startListRoundCount,
        individuals,
        teams,
        isTeam,
        preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
        officialRanksByRound,
        placementSeed,
        frozenSnapshotRounds,
        heatPlanConfirmedAtIso: event.heatPlanConfirmedAtIso,
        mode: "public",
      }),
    [
      eventId,
      initialSettings,
      event.startListRoundCount,
      individuals,
      teams,
      isTeam,
      event.preliminaryHeatLaneCount,
      officialRanksByRound,
      placementSeed,
      frozenSnapshotRounds,
      event.heatPlanConfirmedAtIso,
    ]
  );

  const { rows } = roundDisplay;
  const publicTabCount = rows.length;
  const liveTabsKey = `${event.startListRoundCount ?? "x"}-${roundDisplay.allTabs.map((t) => t.id).join("|")}-pub-${roundDisplay.visibleTabIndices.join(",")}`;
  const archiveLabel = archiveRecordedAtIso
    ? new Date(archiveRecordedAtIso).toLocaleString("ja-JP")
    : null;

  return (
    <Card className="overflow-hidden border-border/80 py-0 shadow-md">
      <CardHeader className="space-y-3 border-b border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="text-base font-semibold leading-snug tracking-tight sm:text-lg">
              {event.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">スタートリスト（公開分）</p>
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="shrink-0 font-medium text-foreground/80">
                {sexLabelJa(event.sex)}
                {isTeam ? "・団体" : "・個人"}
              </span>
              <span className="hidden text-border sm:inline" aria-hidden>
                ·
              </span>
              <span className="min-w-0 truncate">{competitionName}</span>
            </p>
            {event.ageCategoryName ? (
              <p className="text-xs text-muted-foreground">カテゴリ: {event.ageCategoryName}</p>
            ) : null}
            {scheduleLabel ? (
              <p className="text-xs font-medium text-foreground">進行予定: {scheduleLabel}</p>
            ) : null}
          </div>
          {total > 0 ? (
            <Badge variant="secondary" className="w-fit gap-1 font-normal tabular-nums">
              <Users className="size-3 opacity-70" aria-hidden />
              {isTeam ? "チーム" : "選手"} <span className="font-semibold">{total}</span>
            </Badge>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">確定ラウンドのみ表示</p>
        {archiveLabel ? (
          <p className="rounded-md border border-orange-200/80 bg-orange-50/80 px-2.5 py-1 text-[11px] text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100">
            スナップショット記録: {archiveLabel}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-4 sm:px-5">
        {total === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">この種目にエントリーはまだありません</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-4 text-sm leading-relaxed text-muted-foreground">
            この種目のスタートリストはまだ公開されていません。エントリー締切後の確定、または次ラウンド確定後に表示されます。
          </div>
        ) : rows.length === 1 ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {formatStartListTabLabelWithHeatCount(
                rows[0]!.tab.label,
                isTeam ? rows[0]!.teamHeats.length : rows[0]!.individualHeats.length
              )}
            </p>
            <LiveRoundContent
              eventId={eventId}
              isTeam={isTeam}
              individualHeats={rows[0]!.individualHeats}
              teamHeats={rows[0]!.teamHeats}
              marshalDisplayHeatIndices={rows[0]!.marshalDisplayHeatIndices}
              heatAdvanceQuotas={rows[0]!.heatAdvanceQuotas}
              participantStatusRows={
                initialParticipantStatusRows.length > 0 ? initialParticipantStatusRows : null
              }
              marshalRoundForDisplay={
                publicTabCount >= 1 ? snapshotRoundForTab(0, publicTabCount) : null
              }
              participantStatusByKey={participantStatusByKey}
            />
          </div>
        ) : (
          <Tabs key={liveTabsKey} defaultValue={rows[0]!.tab.id} className="mt-1">
            <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1.5">
              {rows.map((row) => {
                const heatCount = isTeam ? row.teamHeats.length : row.individualHeats.length;
                const text = formatStartListTabLabelWithHeatCount(row.tab.label, heatCount);
                return (
                  <TabsTrigger
                    key={row.tab.id}
                    value={row.tab.id}
                    className="max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2.5 py-1.5 text-xs data-[state=active]:shadow-sm sm:max-w-[16rem]"
                    title={text}
                  >
                    {text}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {rows.map((row, pubIndex) => (
              <TabsContent key={row.tab.id} value={row.tab.id} className="mt-3">
                <LiveRoundContent
                  eventId={eventId}
                  isTeam={isTeam}
                  individualHeats={row.individualHeats}
                  teamHeats={row.teamHeats}
                  marshalDisplayHeatIndices={row.marshalDisplayHeatIndices}
                  heatAdvanceQuotas={row.heatAdvanceQuotas}
                  participantStatusRows={
                    initialParticipantStatusRows.length > 0 ? initialParticipantStatusRows : null
                  }
                  marshalRoundForDisplay={
                    publicTabCount >= 1
                      ? snapshotRoundForTab(pubIndex, publicTabCount)
                      : null
                  }
                  participantStatusByKey={participantStatusByKey}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
