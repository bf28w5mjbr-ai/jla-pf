"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  dedupeFrozenTabIndicesBySnapshotRound,
  formatStartListTabLabelWithHeatCount,
  getSnapshotTabPanels,
  overlayLiveTeamMembersOnSnapshotRoundBlock,
} from "@/lib/startListEventTabDisplay";
import { parseStartListSettings, pickHeatSettingForEvent } from "@/lib/startListSettings";
import { SnapshotRoundContent } from "@/components/startListRoundList/SnapshotRoundContent";
import type { SnapshotRoundBlock } from "@/components/startListRoundList/types";
import type { StartListEventCardProps } from "@/lib/startListEventTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";

export default function StartListEventPublicCard({
  competitionName,
  archiveRecordedAtIso,
  event,
  scheduleLabel,
  entryCount,
  initialSettings,
  frozenSnapshotRounds,
  publicHeatResultOverlays,
  teams,
}: StartListEventCardProps) {
  const eventId = event.id;
  const isTeam = event.type === "TEAM";
  const total = entryCount;

  const publicPanels = useMemo(() => {
    if (!frozenSnapshotRounds?.length) return [];
    const parsed = parseStartListSettings(initialSettings);
    const heatSetting = pickHeatSettingForEvent(parsed.eventSettings, eventId);
    const allPanels = getSnapshotTabPanels(
      frozenSnapshotRounds,
      heatSetting,
      event.startListRoundCount
    );
    if (!allPanels?.length) return [];
    const tabCount = allPanels.length;
    const visibleIndices = dedupeFrozenTabIndicesBySnapshotRound(
      tabCount,
      frozenSnapshotRounds
    );
    return visibleIndices
      .map((i) => allPanels[i]!)
      .filter((p) => p.block?.heats?.length)
      .map((p) => {
        const rawBlock = p.block as SnapshotRoundBlock;
        const block =
          isTeam && teams.length > 0
            ? (overlayLiveTeamMembersOnSnapshotRoundBlock(rawBlock, teams) as SnapshotRoundBlock)
            : rawBlock;
        return {
          tabId: p.tabId,
          label: p.label,
          block,
          heatCount: block.heats.length,
        };
      });
  }, [
    eventId,
    initialSettings,
    event.startListRoundCount,
    frozenSnapshotRounds,
    isTeam,
    teams,
  ]);

  const tabsKey = publicPanels.map((p) => p.tabId).join("|");
  const archiveLabel = archiveRecordedAtIso
    ? new Date(archiveRecordedAtIso).toLocaleString("ja-JP")
    : null;
  const withdrawnKeySet = useMemo(() => new Set<string>(), []);
  const overlayByRound = useMemo(() => {
    const map = new Map<string, NonNullable<typeof publicHeatResultOverlays>[number]>();
    for (const overlay of publicHeatResultOverlays ?? []) {
      map.set(overlay.round, overlay);
    }
    return map;
  }, [publicHeatResultOverlays]);
  const hasAnyConfirmedHeatResults = (publicHeatResultOverlays ?? []).some(
    (overlay) => overlay.confirmedHeatIndices.length > 0
  );
  const showPendingResultsHint =
    publicPanels.length > 0 && !hasAnyConfirmedHeatResults;

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
        {showPendingResultsHint ? (
          <p className="text-[11px] text-muted-foreground">
            ヒート確定後、順位が表示されます（暫定）
          </p>
        ) : null}
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
        ) : publicPanels.length === 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-4 text-sm leading-relaxed text-muted-foreground">
            この種目のスタートリストはまだ公開されていません。エントリー締切後の確定、または次ラウンド確定後に表示されます。
          </div>
        ) : publicPanels.length === 1 ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {formatStartListTabLabelWithHeatCount(
                publicPanels[0]!.label,
                publicPanels[0]!.heatCount
              )}
            </p>
            <SnapshotRoundContent
              eventId={eventId}
              roundBlock={publicPanels[0]!.block}
              withdrawnKeySet={withdrawnKeySet}
              resultOverlay={overlayByRound.get(publicPanels[0]!.block.round) ?? null}
            />
          </div>
        ) : (
          <Tabs key={tabsKey} defaultValue={publicPanels[0]!.tabId} className="mt-1">
            <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1.5">
              {publicPanels.map((panel) => {
                const text = formatStartListTabLabelWithHeatCount(panel.label, panel.heatCount);
                return (
                  <TabsTrigger
                    key={panel.tabId}
                    value={panel.tabId}
                    className="max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2.5 py-1.5 text-xs data-[state=active]:shadow-sm sm:max-w-[16rem]"
                    title={text}
                  >
                    {text}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {publicPanels.map((panel) => (
              <TabsContent key={panel.tabId} value={panel.tabId} className="mt-3">
                <SnapshotRoundContent
                  eventId={eventId}
                  roundBlock={panel.block}
                  withdrawnKeySet={withdrawnKeySet}
                  resultOverlay={overlayByRound.get(panel.block.round) ?? null}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
