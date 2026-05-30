"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildStartListEventRoundDisplay,
  computeLiveFirstRoundAdvanceQuotas,
  formatStartListTabLabelWithHeatCount,
  snapshotRoundForTab,
  startListTabDisplaySourceLabel,
} from "@/lib/startListEventTabDisplay";
import { defaultStartListRoundTabLabels } from "@/lib/startListSettings";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { LiveRoundContent } from "@/components/StartListRoundListPanels";
const StartListRoundSettingsCardWithHook = dynamic(
  () =>
    import("@/components/StartListRoundSettingsCard").then((m) => ({
      default: m.StartListRoundSettingsCardWithHook,
    })),
  {
    loading: () => (
      <div
        className="rounded-lg border border-border/80 bg-muted/15 px-3 py-4 text-xs text-muted-foreground"
        role="status"
      >
        ラウンド設定を読み込んでいます…
      </div>
    ),
  }
);
import { StartListMarshalModeBar } from "@/components/StartListMarshalModeBar";
import { useStartListEventDayOps } from "@/hooks/useStartListEventDayOps";
import type { StartListEventCardProps, StartListMarshalViewMode } from "@/lib/startListEventTypes";
import { sexLabelJa } from "@/lib/sexLabelJa";
import { CompetitionEntriesSpreadsheetExportButton } from "@/components/admin/CompetitionEntriesSpreadsheetExportButton";
import {
  buildStartListEventCsvHeaders,
  flattenStartListEventRoundDisplayToCsvRows,
} from "@/lib/startListEventCsvExport";

export default function StartListEventOpsCard(props: StartListEventCardProps) {
  const {
    competitionId,
    competitionName,
    archiveRecordedAtIso,
    event,
    initialSettings,
    defaultMaxLanesPerRace,
    entryCount,
    scheduleLabel,
    individuals,
    teams,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    participantStatusByKey,
    initialParticipantStatusRows,
    initialRoundIndex,
    roundHeatBarItems,
    permissions,
  } = props;

  const { canManageStartListOps, isOrgAdmin, showVenueOps } = permissions;
  const showMarshalOps = showVenueOps;
  const showResultOps = showVenueOps;
  const canEditHeatConfiguration = canManageStartListOps;
  const canEditPublishedScheduleForRoundSetup = isOrgAdmin;

  const isTeam = event.type === "TEAM";
  const total = isTeam ? teams.length : individuals.length;
  const heatLockedByMarshal =
    roundHeatBarItems?.find((e) => e.id === event.id)?.marshalLockedRounds?.includes("HEAT") ??
    false;
  const heatPlanConfirmed = Boolean(event.heatPlanConfirmedAtIso);

  const effectivePreliminaryLanesForPreview =
    event.preliminaryHeatLaneCount ?? defaultMaxLanesPerRace ?? null;

  const roundDisplay = useMemo(
    () =>
      buildStartListEventRoundDisplay({
        eventId: event.id,
        initialSettings,
        startListRoundCount: event.startListRoundCount,
        configuredStartListRoundCount: event.startListRoundCount,
        entryCount,
        individuals,
        teams,
        isTeam,
        preliminaryHeatLaneCount: effectivePreliminaryLanesForPreview,
        officialRanksByRound,
        placementSeed,
        frozenSnapshotRounds,
        heatPlanConfirmedAtIso: event.heatPlanConfirmedAtIso,
        mode: "ops",
      }),
    [
      event.id,
      initialSettings,
      event.startListRoundCount,
      entryCount,
      individuals,
      teams,
      isTeam,
      effectivePreliminaryLanesForPreview,
      officialRanksByRound,
      placementSeed,
      frozenSnapshotRounds,
      event.heatPlanConfirmedAtIso,
    ]
  );

  const csvExport = useMemo(() => {
    const headers = buildStartListEventCsvHeaders(isTeam);
    const rows = flattenStartListEventRoundDisplayToCsvRows(roundDisplay, isTeam);
    return { headers, rows };
  }, [roundDisplay, isTeam]);

  const tabs = roundDisplay.allTabs;
  const displayRows = roundDisplay.rows;

  const [activeTabUserPick, setActiveTabUserPick] = useState<string | null>(null);
  const selectedTabId = useMemo(() => {
    const first = tabs[0]?.id ?? "";
    if (!first) return "";
    if (activeTabUserPick && tabs.some((t) => t.id === activeTabUserPick)) {
      return activeTabUserPick;
    }
    if (
      typeof initialRoundIndex === "number" &&
      Number.isInteger(initialRoundIndex) &&
      initialRoundIndex >= 0 &&
      initialRoundIndex < tabs.length
    ) {
      const deep = tabs[initialRoundIndex]?.id;
      if (deep) return deep;
    }
    return first;
  }, [tabs, activeTabUserPick, initialRoundIndex]);

  const tabCount = tabs.length;
  const activeTabIndex = useMemo(() => {
    const i = tabs.findIndex((t) => t.id === selectedTabId);
    if (i >= 0) return i;
    return tabs.length > 0 ? 0 : -1;
  }, [tabs, selectedTabId]);

  const dayOps = useStartListEventDayOps({
    competitionId,
    eventId: event.id,
    showMarshalOps,
    showResultOps,
    initialParticipantStatusRows,
    activeTabIndex,
    tabCount,
  });

  const roundTabDisplayLabels = useMemo(
    () => defaultStartListRoundTabLabels(tabs.length),
    [tabs.length]
  );

  const renderMarshalModeBar = (tabId: string, tabIndex: number) => {
    if (!dayOps.showDayOpsShell || !heatPlanConfirmed || !tabId) return null;
    const roundName =
      roundTabDisplayLabels[tabIndex]?.trim() || `ラウンド ${tabIndex + 1}`;
    const mode: StartListMarshalViewMode = dayOps.getViewModeForTab(tabId);
    return (
      <StartListMarshalModeBar
        tabId={tabId}
        tabCount={tabCount}
        roundName={roundName}
        mode={mode}
        showMarshalOps={showMarshalOps}
        showResultOps={showResultOps}
        onModeChange={dayOps.persistMarshalViewMode}
      />
    );
  };

  const renderListBlock = (index: number) => {
    if (total === 0) {
      return (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">この種目にエントリーはまだありません</p>
        </div>
      );
    }
    const row = displayRows[index];
    const heatsLen = row
      ? isTeam
        ? row.teamHeats.length
        : row.individualHeats.length
      : 0;
    let heatAdvanceQuotasForRow = row?.heatAdvanceQuotas ?? null;
    const roundForList = tabCount >= 1 ? snapshotRoundForTab(index, tabCount) : null;
    const tabIdForRow = tabs[index]?.id ?? "";
    const viewModeForRow = dayOps.getViewModeForTab(tabIdForRow);
    if (
      row &&
      heatsLen > 0 &&
      viewModeForRow === "result" &&
      index === 0 &&
      activeTabIndex === index &&
      tabCount >= 2 &&
      typeof effectivePreliminaryLanesForPreview === "number" &&
      effectivePreliminaryLanesForPreview >= 1 &&
      heatPlanConfirmed &&
      !dayOps.marshalRoundMismatch &&
      dayOps.listMarshalHeats &&
      dayOps.listMarshalHeats.length > 0
    ) {
      const calledSizes = Array.from({ length: heatsLen }, (_, heatIndex) => {
        const displayNum = row.marshalDisplayHeatIndices?.[heatIndex] ?? heatIndex + 1;
        const apiHeat = dayOps.listMarshalHeatsByIndex.get(Number(displayNum));
        if (!apiHeat?.participants?.length) return 0;
        return apiHeat.participants.filter((p) => isCalledLikeStatus(p.status)).length;
      });
      const totalCalled = calledSizes.reduce((a, b) => a + b, 0);
      if (totalCalled > 0) {
        heatAdvanceQuotasForRow = computeLiveFirstRoundAdvanceQuotas({
          heatSizes: calledSizes,
          totalParticipants: totalCalled,
          liveTabs: tabs,
          preliminaryHeatLaneCount: effectivePreliminaryLanesForPreview,
          eventHeatSetting: roundDisplay.eventHeatSetting,
        });
      }
    }
    const marshalUiModeForRow =
      viewModeForRow === "marshal"
        ? ("inline" as const)
        : viewModeForRow === "result"
          ? ("result" as const)
          : ("dialog" as const);
    const startListMarshal =
      dayOps.showDayOpsShell && activeTabIndex === index && dayOps.listMarshalRound !== null
        ? {
            heats: dayOps.listMarshalHeats,
            loading: dayOps.listMarshalLoading,
            round: dayOps.listMarshalRoundForMutations ?? dayOps.listMarshalRound,
            competitionId,
            marshalOpsBlocked: !heatPlanConfirmed || dayOps.marshalRoundMismatch,
            marshalRoundMismatch: dayOps.marshalRoundMismatch,
            isCallClosed: false,
            marshalUiMode: marshalUiModeForRow,
            resultCapture:
              viewModeForRow === "result"
                ? {
                    rows: dayOps.listResultRows,
                    locked: dayOps.listResultLocked,
                    loading: dayOps.listResultLoading,
                    confirmedHeats: dayOps.listResultConfirmedHeats,
                    onRefetch: dayOps.refetchResultCapture,
                  }
                : undefined,
            onMarshalSuccess: dayOps.onMarshalSuccess,
          }
        : null;
    return (
      <LiveRoundContent
        key={`sl-${event.id}-${index}`}
        eventId={event.id}
        isTeam={isTeam}
        heatPlanConfirmedForDsq={heatPlanConfirmed}
        individualHeats={row?.individualHeats ?? []}
        teamHeats={row?.teamHeats ?? []}
        marshalDisplayHeatIndices={row?.marshalDisplayHeatIndices ?? null}
        heatAdvanceQuotas={heatAdvanceQuotasForRow}
        startListMarshal={startListMarshal}
        participantStatusRows={
          dayOps.polledParticipantStatusRows.length > 0
            ? dayOps.polledParticipantStatusRows
            : null
        }
        marshalRoundForDisplay={roundForList}
        participantStatusByKey={participantStatusByKey}
        displaySource={row?.displaySource}
        previewEstimatedParticipants={row?.previewEstimatedParticipants}
        previewMaxLanesPerHeat={row?.previewMaxLanesPerHeat}
      />
    );
  };

  const useTabsChrome = tabCount > 1;
  const archiveLabel = archiveRecordedAtIso
    ? new Date(archiveRecordedAtIso).toLocaleString("ja-JP")
    : null;

  return (
    <Card className="overflow-hidden border-border/80 py-0 shadow-md">
      <CardHeader className="space-y-3 border-b border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold leading-snug tracking-tight sm:text-lg">
                  {event.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">スタートリスト</p>
              </div>
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="shrink-0 font-medium text-foreground/80">
                {sexLabelJa(event.sex)}
                {event.type === "TEAM" ? "・団体" : "・個人"}
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
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <Badge variant="secondary" className="gap-1 font-normal tabular-nums">
              <Users className="size-3 opacity-70" aria-hidden />
              {isTeam ? "チーム" : "選手"}{" "}
              <span className="font-semibold">{total}</span>
            </Badge>
            {!heatPlanConfirmed ? (
              <Badge
                variant="outline"
                className="border-amber-400/80 bg-amber-50 font-normal text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              >
                ヒート・レーン未確定
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/50 bg-emerald-50 font-normal text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100"
              >
                ヒート確定済み
              </Badge>
            )}
            {heatLockedByMarshal ? (
              <Badge variant="outline" className="font-normal">
                分割固定
              </Badge>
            ) : null}
            <CompetitionEntriesSpreadsheetExportButton
              csvHeaders={csvExport.headers}
              csvRows={csvExport.rows}
              fileNameBase={`${competitionName}_${event.name}_スタートリスト`}
              label="CSVダウンロード"
            />
          </div>
        </div>
        {archiveLabel ? (
          <p
            className="text-[11px] text-muted-foreground"
            title={
              frozenSnapshotRounds?.length
                ? "確定ラウンドは記録どおり、未確定は最新エントリーで再計算"
                : "表示は最新エントリーに追随"
            }
          >
            記録: {archiveLabel}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 sm:px-5">
        {!heatPlanConfirmed && !canEditHeatConfiguration ? (
          <p className="text-xs text-muted-foreground">主催者のヒート・レーン確定待ちです。</p>
        ) : null}
        {canEditHeatConfiguration && !heatPlanConfirmed && !canEditPublishedScheduleForRoundSetup ? (
          <div className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 text-xs leading-relaxed">
            <p className="font-medium text-foreground">ラウンド・ヒート・レーン（準備中）</p>
            <p className="mt-1 text-muted-foreground">
              タイムスケジュールやラウンド数の編集は主催の管理者のみが行えます。管理者が大会ページの「スタートリスト」から設定・保存・確定するまでお待ちください。
            </p>
          </div>
        ) : null}
        {canEditHeatConfiguration && canEditPublishedScheduleForRoundSetup ? (
          roundHeatBarItems && roundHeatBarItems.length > 0 ? (
            <StartListRoundSettingsCardWithHook
              competitionId={competitionId}
              competitionName={competitionName}
              focusEventId={event.id}
              barItems={roundHeatBarItems}
              initialStartListSettings={initialSettings}
              scheduleLabel={scheduleLabel}
            />
          ) : (
            <div className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-medium text-foreground">ラウンド・ヒート・レーン</p>
              <p className="mt-1 text-muted-foreground">
                種目データの読み込みに失敗したか、大会に種目がまだありません。大会ページの「スタートリスト」タブから設定してください。
              </p>
              <div className="mt-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <Link href={`/competitions/${competitionId}?tab=start-list`}>
                    スタートリスト設定へ
                  </Link>
                </Button>
              </div>
            </div>
          )
        ) : null}
        {selectedTabId && tabCount > 0 ? (
          useTabsChrome ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">リスト</p>
              <Tabs value={selectedTabId} onValueChange={setActiveTabUserPick} className="w-full">
                <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1.5">
                  {tabs.map((t, index) => {
                    const row = displayRows[index];
                    const heatCount = isTeam
                      ? (row?.teamHeats.length ?? 0)
                      : (row?.individualHeats.length ?? 0);
                    const baseLabel =
                      roundTabDisplayLabels[index]?.trim() || `#${index + 1}`;
                    const tabText = formatStartListTabLabelWithHeatCount(baseLabel, heatCount);
                    const sourceLabel = row ? startListTabDisplaySourceLabel(row.displaySource) : null;
                    return (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2.5 py-1.5 text-xs data-[state=active]:shadow-sm sm:max-w-[16rem]"
                        title={sourceLabel ? `${tabText}（${sourceLabel}）` : tabText}
                      >
                        <span className="truncate">{tabText}</span>
                        {sourceLabel ? (
                          <span className="ml-1 shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                            {sourceLabel}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {tabs.map((t, index) => (
                  <TabsContent key={t.id} value={t.id} className="mt-3 space-y-3">
                    {renderMarshalModeBar(t.id, index)}
                    <div className="rounded-lg border border-border/50 bg-muted/5 p-2 sm:p-3">
                      {renderListBlock(index)}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">リスト</p>
              <div className="space-y-3">
                {selectedTabId ? renderMarshalModeBar(selectedTabId, 0) : null}
                <div className="rounded-lg border border-border/50 bg-muted/5 p-2 sm:p-3">
                  {renderListBlock(0)}
                </div>
              </div>
            </div>
          )
        ) : null}
        <details className="group rounded-lg border border-border/60 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground">
            <CircleHelp className="size-3.5 shrink-0 opacity-80" aria-hidden />
            <span>ヘルプ</span>
            <ChevronDown
              className="ml-auto size-3.5 shrink-0 opacity-70 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-2 border-t border-border/50 px-2.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">ラウンド・ヒート・レーン</span>
              ：大会ページのスタートリスト（種目一覧のラウンド設定）で「ヒート・レーンを保存」まで完了すると当日運用に進めます。マーシャル締切済みのラウンドは分割変更不可。
            </p>
            <p>
              <span className="font-medium text-foreground">ステップ2</span>
              ：タブでラウンド切替。1レースあたりの最大レーン数（全ラウンド共通）は「大会設定 → 種目・参加費」で編集します。
            </p>
            {tabCount >= 2 ? (
              <p>
                複数ラウンド時、先頭のヒート見出しには次ラ定員を人数比で配分した進出数を表示します（
                <span className="whitespace-nowrap font-mono text-[10px] text-foreground/80">
                  min(次ラヒート×レーン, 参加数)
                </span>
                ）。
              </p>
            ) : null}
            {dayOps.showDayOpsShell ? (
              <p>
                {showMarshalOps ? (
                  <>
                    <span className="font-medium text-foreground">表示モード</span>
                    ：通常＝一覧のみ。マーシャル＝召集・NFC・ヒート締切（締切前は付け外し可）。リザルト＝召集済みのみ着順入力・NFC。
                    マーシャル締切は各ヒート見出しから。タブごとにモードは独立です。
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">表示モード</span>
                    ：通常＝一覧。リザルト＝着順入力（本画面のインライン）。
                  </>
                )}
              </p>
            ) : null}
            <p className="text-[11px]">
              表示データ：
              {frozenSnapshotRounds?.length
                ? "記録＝スナップショット確定、試算＝進出者未確定の枠のみ、最新＝未凍結のエントリー追随。"
                : "最新エントリーに追随。"}
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
