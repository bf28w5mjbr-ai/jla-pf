"use client";

import type { ResultRound } from "@prisma/client";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { HeatSetting } from "@/lib/startListSettings";
import {
  dedupeFrozenTabIndicesBySnapshotRound,
  formatStartListTabLabelWithHeatCount,
  getLiveHeatsByTab,
  getLiveTabsAligned,
  snapshotRoundForTab,
  type StartListIndividualInput,
  type StartListTeamInput,
} from "@/lib/startListEventTabDisplay";
import type { StartListRoundData } from "@/lib/startListRounds";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveRoundContent, sexLabel } from "@/components/StartListRoundListPanels";

type Props = {
  competitionName: string;
  /** DB 上のスタートリストスナップショットの記録日時（表示は常にライブ） */
  archiveRecordedAtIso: string | null;
  event: {
    id: string;
    name: string;
    sex: string;
    type: "INDIVIDUAL" | "TEAM";
    ageCategoryName?: string | null;
  };
  scheduleLabel?: string | null;
  individuals: StartListIndividualInput[];
  teams: StartListTeamInput[];
  setting: HeatSetting;
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  placementSeed: number;
  frozenSnapshotRounds?: StartListRoundData[] | null;
  startListRoundCount?: number | null;
  preliminaryHeatLaneCount?: number | null;
  /** ステップ1確定済みのとき先頭ラウンドに按分アップ人数を表示 */
  heatPlanStep1Confirmed?: boolean;
  /** 種目の当日運用ステータス（ヒート表で失格・欠場・棄権を表示） */
  participantStatusByKey?: Record<string, string>;
  initialParticipantStatusRows?: ReadonlyArray<{
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    status: string;
    marshalRound: ResultRound;
    updatedAt: string | Date;
    calledAt?: string | Date | null;
  }>;
  /**
   * この秒数ごとに router.refresh() して SSR を再取得（一般閲覧で失格バッジ等の遅延を軽減）。
   * 未指定または 15 未満のときは無効。
   */
  softRefreshIntervalSec?: number;
};

export default function CompetitionStartListEventBlock({
  competitionName,
  archiveRecordedAtIso,
  event,
  scheduleLabel,
  individuals,
  teams,
  setting,
  officialRanksByRound = null,
  placementSeed,
  frozenSnapshotRounds = null,
  startListRoundCount = null,
  preliminaryHeatLaneCount = null,
  heatPlanStep1Confirmed = false,
  participantStatusByKey,
  initialParticipantStatusRows,
  softRefreshIntervalSec,
}: Props) {
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

  const liveTabs = useMemo(
    () => getLiveTabsAligned(setting, startListRoundCount),
    [setting, startListRoundCount]
  );

  const liveHeatsByTab = useMemo(
    () =>
      getLiveHeatsByTab({
        liveTabs,
        individuals,
        teams,
        isTeam,
        preliminaryHeatLaneCount,
        officialRanksByRound,
        placementSeed,
        frozenSnapshotRounds,
        heatPlanStep1Confirmed,
        eventHeatSetting: setting,
      }),
    [
      liveTabs,
      individuals,
      teams,
      isTeam,
      preliminaryHeatLaneCount,
      officialRanksByRound,
      placementSeed,
      frozenSnapshotRounds,
      heatPlanStep1Confirmed,
      setting,
    ]
  );

  const tabCount = liveTabs.length;
  const publicVisibleIndices = useMemo(
    () => dedupeFrozenTabIndicesBySnapshotRound(tabCount, frozenSnapshotRounds),
    [tabCount, frozenSnapshotRounds]
  );
  const publicLiveTabs = publicVisibleIndices.map((i) => liveTabs[i]!);
  const publicLiveHeatsByTab = publicVisibleIndices.map((i) => liveHeatsByTab[i]!);
  const publicTabCount = publicLiveTabs.length;

  const liveTabsKey = `${startListRoundCount ?? "x"}-${liveTabs.map((t) => t.id).join("|")}-pub-${publicVisibleIndices.join(",")}`;
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
                {sexLabel(event.sex)}
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
        ) : publicLiveTabs.length === 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-4 text-sm leading-relaxed text-muted-foreground">
            この種目のスタートリストはまだ公開されていません。エントリー締切後の確定、または次ラウンド確定後に表示されます。
          </div>
        ) : publicLiveTabs.length === 1 ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {formatStartListTabLabelWithHeatCount(
                publicLiveTabs[0]!.label,
                isTeam
                  ? (publicLiveHeatsByTab[0]?.teamHeats.length ?? 0)
                  : (publicLiveHeatsByTab[0]?.individualHeats.length ?? 0)
              )}
            </p>
            <LiveRoundContent
              eventId={eventId}
              isTeam={isTeam}
              individualHeats={publicLiveHeatsByTab[0]?.individualHeats ?? []}
              teamHeats={publicLiveHeatsByTab[0]?.teamHeats ?? []}
              marshalDisplayHeatIndices={publicLiveHeatsByTab[0]?.marshalDisplayHeatIndices ?? null}
              heatAdvanceQuotas={publicLiveHeatsByTab[0]?.heatAdvanceQuotas ?? null}
              participantStatusRows={
                initialParticipantStatusRows && initialParticipantStatusRows.length > 0
                  ? initialParticipantStatusRows
                  : null
              }
              marshalRoundForDisplay={
                publicTabCount >= 1 ? snapshotRoundForTab(0, publicTabCount) : null
              }
              participantStatusByKey={participantStatusByKey}
            />
          </div>
        ) : (
          <Tabs key={liveTabsKey} defaultValue={publicLiveTabs[0]!.id} className="mt-1">
            <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1.5">
              {publicLiveTabs.map((t, index) => {
                const row = publicLiveHeatsByTab[index];
                const heatCount = isTeam
                  ? (row?.teamHeats.length ?? 0)
                  : (row?.individualHeats.length ?? 0);
                const text = formatStartListTabLabelWithHeatCount(t.label, heatCount);
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2.5 py-1.5 text-xs data-[state=active]:shadow-sm sm:max-w-[16rem]"
                    title={text}
                  >
                    {text}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {publicLiveHeatsByTab.map(
              (
                { tab, individualHeats, teamHeats, heatAdvanceQuotas, marshalDisplayHeatIndices },
                pubIndex
              ) => (
                <TabsContent key={tab.id} value={tab.id} className="mt-3">
                  <LiveRoundContent
                    eventId={eventId}
                    isTeam={isTeam}
                    individualHeats={individualHeats}
                    teamHeats={teamHeats}
                    marshalDisplayHeatIndices={marshalDisplayHeatIndices ?? null}
                    heatAdvanceQuotas={heatAdvanceQuotas ?? null}
                    participantStatusRows={
                      initialParticipantStatusRows && initialParticipantStatusRows.length > 0
                        ? initialParticipantStatusRows
                        : null
                    }
                    marshalRoundForDisplay={
                      publicTabCount >= 1
                        ? snapshotRoundForTab(pubIndex, publicTabCount)
                        : null
                    }
                    participantStatusByKey={participantStatusByKey}
                  />
                </TabsContent>
              )
            )}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
