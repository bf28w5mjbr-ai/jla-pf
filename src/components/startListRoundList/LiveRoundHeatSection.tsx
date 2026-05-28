"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  marshalParticipantKey,
  type HeatMarshalHeatRow,
  type HeatMarshalParticipant,
} from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  dayOpsParticipantStatusLabelJa,
  isDayOpsTerminalParticipantStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { secondaryClubLabelForTeamRow } from "@/lib/startListTeamDisplay";
import { marshalIndividualKey, marshalTeamLegacyKey } from "@/lib/dayOpsParticipantKeys";
import { cn } from "@/lib/utils";
import type { ResultDraftOp } from "@/hooks/liveRound/types";
import type { IndividualItem, LiveRoundContentProps, TeamItem } from "./types";
import {
  canApplyRunUp,
  countCalledInMarshalHeat,
  countOkRanksForHeat,
  countRunUpForHeat,
  eliminationSlots,
  foldTeamServerStatusFromMemberKeys,
  HeatAdvanceQuotaLabel,
  isEliminationStyleResultInput,
  isHeatResultReadyForConfirm,
  individualLiveRowLabel,
  LaneRow,
  marshalDisplayClass,
  marshalParticipantForLane,
  orderIndividualItemsByConfirmedResultRank,
  orderTeamItemsByConfirmedResultRank,
  snapshotLaneForIndividual,
  snapshotLaneForTeam,
  StartListParticipantRowBody,
} from "./panelHelpers";
import { LiveRoundMarshalLaneRow } from "./LiveRoundMarshalLaneRow";
import type { LiveRoundMarshalLaneRowProps } from "./LiveRoundMarshalLaneRow";
import { LiveRoundResultLaneRow } from "./LiveRoundResultLaneRow";
import type { LiveRoundResultLaneRowProps } from "./LiveRoundResultLaneRow";

type StartListMarshal = NonNullable<LiveRoundContentProps["startListMarshal"]>;
type ResultCapture = NonNullable<StartListMarshal["resultCapture"]>;

export type LiveRoundHeatSectionProps = {
  isTeam: boolean;
  eventId: string;
  heatIndex: number;
  heatItems: IndividualItem[] | TeamItem[];
  displayHeatNumber: number;
  apiHeat: HeatMarshalHeatRow | undefined;
  heatAdvanceQuota: number | null | undefined;
  m: StartListMarshal | null;
  resultCapture: ResultCapture | undefined;
  statusByKey: Record<string, string>;
  marshalRoundMismatch: boolean;
  showMarshalAdminUi: boolean;
  showMarshalHeatControls: boolean;
  resultCaptureVisible: boolean;
  marshalInline: boolean;
  localConfirmedHeats: number[];
  localResultRows: HeatResultCaptureRow[];
  resultDraftOps: Record<string, ResultDraftOp>;
  resultDraftErrors: Record<string, string>;
  resultInputOrder: "asc" | "desc";
  tieNextHeatIndex: number | null;
  setTieNextHeatIndex: Dispatch<SetStateAction<number | null>>;
  resultCapturePendingKey: string | null;
  dragSourceParticipantKey: string | null;
  dragOverParticipantKey: string | null;
  setDragSourceParticipantKey: (key: string | null) => void;
  setDragOverParticipantKey: (key: string | null) => void;
  countResultDraftsForHeat: (heatIndex: number) => number;
  toggleResultDraft: LiveRoundResultLaneRowProps["onToggleDraft"];
  reorderResultRanks: LiveRoundResultLaneRowProps["onReorderRanks"];
  setHeatResultConfirmTarget: (n: number | null) => void;
  heatResultConfirmBusy: boolean;
  setRunUpTarget: (n: number | null) => void;
  setClearRunUpTarget: (n: number | null) => void;
  runUpBusy: boolean;
  setHeatCloseTarget: (n: number | null) => void;
  setHeatReopenTarget: (n: number | null) => void;
  marshalBulkSubmitting: boolean;
  marshalPendingKey: string | null;
  marshalDraftErrors: Record<string, string>;
  queueMarshalDraftToggle: LiveRoundMarshalLaneRowProps["onToggleDraft"];
};

export function LiveRoundHeatSection(props: LiveRoundHeatSectionProps) {
  const {
    isTeam,
    eventId,
    heatIndex,
    heatItems,
    displayHeatNumber,
    apiHeat,
    heatAdvanceQuota,
    m,
    resultCapture,
    statusByKey,
    marshalRoundMismatch,
    showMarshalAdminUi,
    showMarshalHeatControls,
    resultCaptureVisible,
    marshalInline,
    localConfirmedHeats,
    localResultRows,
    resultDraftOps,
    resultDraftErrors,
    resultInputOrder,
    tieNextHeatIndex,
    setTieNextHeatIndex,
    resultCapturePendingKey,
    dragSourceParticipantKey,
    dragOverParticipantKey,
    setDragSourceParticipantKey,
    setDragOverParticipantKey,
    countResultDraftsForHeat,
    toggleResultDraft,
    reorderResultRanks,
    setHeatResultConfirmTarget,
    heatResultConfirmBusy,
    setRunUpTarget,
    setClearRunUpTarget,
    runUpBusy,
    setHeatCloseTarget,
    setHeatReopenTarget,
    marshalBulkSubmitting,
    marshalPendingKey,
    marshalDraftErrors,
    queueMarshalDraftToggle,
  } = props;

  if (isTeam) {
    const teams = heatItems as TeamItem[];

    const heatCallClosed = Boolean(apiHeat?.callClosedAt);
    const heatCloseDisabled =
      !m ||
      m.loading ||
      !apiHeat ||
      m.marshalOpsBlocked ||
      marshalRoundMismatch ||
      m.isCallClosed ||
      heatCallClosed;
    const heatReopenDisabled =
      !m ||
      m.loading ||
      !apiHeat ||
      m.marshalOpsBlocked ||
      marshalRoundMismatch ||
      Boolean(apiHeat?.marshalReopenBlocked);
    const heatConfirmedForSort = localConfirmedHeats.includes(displayHeatNumber);
    const calledForResultConfirm = countCalledInMarshalHeat(apiHeat);
    const rankOkCount = countOkRanksForHeat(localResultRows, displayHeatNumber, apiHeat);
    const runUpCount = countRunUpForHeat(localResultRows, displayHeatNumber, apiHeat);
    const resultDraftCount = countResultDraftsForHeat(displayHeatNumber);
    const eliminationStyle = isEliminationStyleResultInput(heatAdvanceQuota ?? null, resultInputOrder);
    const elimSlots = eliminationStyle
      ? eliminationSlots({ called: calledForResultConfirm, quota: heatAdvanceQuota ?? null })
      : null;
    const canTieInHeat = rankOkCount > 0;
    const heatResultRanksComplete = isHeatResultReadyForConfirm({
      called: calledForResultConfirm,
      quota: heatAdvanceQuota ?? null,
      rankedCount: rankOkCount,
      runUpCount,
      resultDraftCount,
      usesElimination: eliminationStyle,
    });
    const runUpApplyEnabled = canApplyRunUp({
      called: calledForResultConfirm,
      quota: heatAdvanceQuota ?? null,
      rankedCount: rankOkCount,
      runUpCount,
      resultDraftCount,
    });
    const teamForResult = heatConfirmedForSort
      ? orderTeamItemsByConfirmedResultRank(teams, displayHeatNumber, localResultRows)
      : teams;
    return (
      <div
        key={`${eventId}-heat-${heatIndex}`}
        className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <p className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            ヒート {displayHeatNumber}（{teams.length}件）
            {typeof heatAdvanceQuota === "number" ? (
              <HeatAdvanceQuotaLabel
                quota={heatAdvanceQuota}
                resultCaptureVisible={resultCaptureVisible}
                rankOkCount={rankOkCount}
                runUpCount={runUpCount}
                calledCount={calledForResultConfirm}
                hasApiHeat={Boolean(apiHeat)}
              />
            ) : null}
            {(showMarshalAdminUi || resultCaptureVisible) &&
            !m?.loading &&
            !apiHeat &&
            !marshalRoundMismatch ? (
              <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-300">
                · スナップショットに未登録（マーシャル・リザルト記録不可）
              </span>
            ) : null}
          </p>
          {(resultCaptureVisible && m && resultCapture) || showMarshalAdminUi ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {resultCaptureVisible && m && resultCapture ? (
                <>
                  {localConfirmedHeats.includes(displayHeatNumber) ? (
                    <span className="rounded bg-violet-200/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      リザルト確定済み
                    </span>
                  ) : null}
                  {!localConfirmedHeats.includes(displayHeatNumber) &&
                  resultDraftCount > 0 ? (
                    <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      未確定 {resultDraftCount}件
                    </span>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) &&
                  runUpCount > 0 ? (
                    <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      ランアップ {runUpCount}名
                    </span>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) &&
                  runUpCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        m.loading ||
                        resultCapture.loading ||
                        resultCapture.locked ||
                        m.marshalOpsBlocked ||
                        marshalRoundMismatch ||
                        !apiHeat ||
                        !heatCallClosed ||
                        heatResultConfirmBusy ||
                        runUpBusy
                      }
                      onClick={() => setClearRunUpTarget(displayHeatNumber)}
                    >
                      ランアップ解除
                    </Button>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        m.loading ||
                        resultCapture.loading ||
                        resultCapture.locked ||
                        m.marshalOpsBlocked ||
                        marshalRoundMismatch ||
                        !apiHeat ||
                        !heatCallClosed ||
                        heatResultConfirmBusy ||
                        runUpBusy ||
                        !runUpApplyEnabled
                      }
                      onClick={() => setRunUpTarget(displayHeatNumber)}
                    >
                      残りをランアップ
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={
                      m.loading ||
                      resultCapture.loading ||
                      resultCapture.locked ||
                      m.marshalOpsBlocked ||
                      marshalRoundMismatch ||
                      !apiHeat ||
                      !heatCallClosed ||
                      localConfirmedHeats.includes(displayHeatNumber) ||
                      heatResultConfirmBusy ||
                      runUpBusy ||
                      !heatResultRanksComplete
                    }
                    onClick={() => setHeatResultConfirmTarget(displayHeatNumber)}
                  >
                    リザルト確定
                  </Button>
                  <Button
                    type="button"
                    variant={
                      tieNextHeatIndex === displayHeatNumber ? "default" : "outline"
                    }
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={
                      m.loading ||
                      resultCapture.loading ||
                      resultCapture.locked ||
                      m.marshalOpsBlocked ||
                      marshalRoundMismatch ||
                      !apiHeat ||
                      !heatCallClosed ||
                      localConfirmedHeats.includes(displayHeatNumber) ||
                      !canTieInHeat
                    }
                    onClick={() =>
                      setTieNextHeatIndex((prev) =>
                        prev === displayHeatNumber ? null : displayHeatNumber
                      )
                    }
                  >
                    次を同着
                  </Button>
                </>
              ) : null}
              {showMarshalAdminUi ? (
                <>
                  {heatCallClosed ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:bg-amber-950/80 dark:text-amber-100">
                      締切済み
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-100">
                      受付中
                    </span>
                  )}
                  {showMarshalHeatControls ? (
                    heatCallClosed ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={heatReopenDisabled}
                        title={
                          apiHeat?.marshalReopenBlocked
                            ? "公式リザルトがあるヒートは受付中に戻せません"
                            : undefined
                        }
                        onClick={() => setHeatReopenTarget(displayHeatNumber)}
                      >
                        受付中に戻す
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={heatCloseDisabled}
                        onClick={() => setHeatCloseTarget(displayHeatNumber)}
                      >
                        マーシャル締切
                      </Button>
                    )
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {(m?.loading || (resultCaptureVisible && resultCapture?.loading)) ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {resultCaptureVisible && resultCapture?.loading && !m?.loading
              ? "リザルト記録状況を読み込み中…"
              : "マーシャル状態を読み込み中…"}
          </p>
        ) : null}
        {resultCaptureVisible &&
        m &&
        resultCapture &&
        apiHeat &&
        !heatCallClosed &&
        !localConfirmedHeats.includes(displayHeatNumber) ? (
          <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
            マーシャル締切後にリザルトを記録できます。「マーシャル締切」を実行してください。
          </p>
        ) : null}
        {resultCaptureVisible &&
        m &&
        resultCapture &&
        !heatConfirmedForSort &&
        apiHeat &&
        calledForResultConfirm > 0 &&
        !heatResultRanksComplete ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
            {eliminationStyle ? (
              <>
                脱落着順 {rankOkCount}
                {elimSlots ? ` / ${elimSlots.eliminationTarget}` : ""} 名・ランアップ {runUpCount}
                {elimSlots ? ` / ${elimSlots.runUpTarget}` : ""} 名（未確定チェック {resultDraftCount}{" "}
                件）。下位から脱落を記録し、「残りをランアップ」してから確定してください。
              </>
            ) : (
              <>
                召集済み {calledForResultConfirm} 名のうち、着順入力済み {rankOkCount}{" "}
                件・未確定 {resultDraftCount} 件です。全員分が反映されるまでリザルト確定はできません。
              </>
            )}
          </p>
        ) : null}
        {resultCaptureVisible && m && resultCapture ? (
          <>
            <ul className="mt-1 space-y-0.5">
              {(heatConfirmedForSort
                ? teamForResult.map((team, index) => ({
                    team,
                    originalIndex: teams.findIndex((x) => x.teamEntryId === team.teamEntryId),
                    fallbackIndex: index,
                  }))
                : teamForResult
                    .map((team, index) => {
                      const originalIndex = teams.findIndex((x) => x.teamEntryId === team.teamEntryId);
                      const fallbackLane = originalIndex >= 0 ? originalIndex + 1 : index + 1;
                      const rankForSort = localResultRows.find(
                        (r) =>
                          r.heat === displayHeatNumber &&
                          r.entryType === "TEAM" &&
                          r.teamEntryId === team.teamEntryId &&
                          r.rank != null
                      )?.rank;
                      return {
                        team,
                        originalIndex,
                        fallbackIndex: index,
                        laneForSort: snapshotLaneForTeam(apiHeat, team.teamEntryId, fallbackLane),
                        rankForSort: rankForSort ?? null,
                      };
                    })
                    .sort((a, b) => {
                      const ar = a.rankForSort;
                      const br = b.rankForSort;
                      if (ar != null && br != null) {
                        if (ar !== br) {
                          return resultInputOrder === "asc" ? ar - br : br - ar;
                        }
                        return a.laneForSort - b.laneForSort;
                      }
                      if (ar != null || br != null) {
                        return ar != null ? -1 : 1;
                      }
                      return resultInputOrder === "asc"
                        ? a.laneForSort - b.laneForSort
                        : b.laneForSort - a.laneForSort;
                    })).map(({ team, originalIndex, fallbackIndex }) => {
                const fallLane = originalIndex >= 0 ? originalIndex + 1 : fallbackIndex + 1;
                const snapLane = snapshotLaneForTeam(apiHeat, team.teamEntryId, fallLane);
                const laneIndex0 = originalIndex >= 0 ? originalIndex : fallbackIndex;
                const clubSecondary = secondaryClubLabelForTeamRow(
                  team.teamName,
                  team.clubName
                );
                return (
                  <LiveRoundResultLaneRow
                    key={`${eventId}-team-${heatIndex}-${team.teamEntryId}-${laneIndex0}`}
                    marshal={m}
                    resultCapture={resultCapture}
                    apiHeatForHeat={apiHeat}
                    displayHeatNumber={displayHeatNumber}
                    laneNumber={snapLane}
                    laneIndex0={laneIndex0}
                    nameContent={
                      <>
                        <p className="font-medium">
                          {team.teamName}
                          {clubSecondary ? (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              ({clubSecondary})
                            </span>
                          ) : null}
                        </p>
                        {team.members.length > 0 && (
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {team.members.join(" / ")}
                          </div>
                        )}
                      </>
                    }
                    rowKey={`${eventId}-team-${heatIndex}-${team.teamEntryId}-${laneIndex0}`}
                    serverStatus={foldTeamServerStatusFromMemberKeys(team.teamEntryId, statusByKey)}
                    participantRankKey={marshalTeamLegacyKey(team.teamEntryId)}
                    localResultRows={localResultRows}
                    localConfirmedHeats={localConfirmedHeats}
                    resultDraftOps={resultDraftOps}
                    resultDraftErrors={resultDraftErrors}
                    resultInputOrder={resultInputOrder}
                    tieNextHeatIndex={tieNextHeatIndex}
                    resultCapturePendingKey={resultCapturePendingKey}
                    dragSourceParticipantKey={dragSourceParticipantKey}
                    dragOverParticipantKey={dragOverParticipantKey}
                    onToggleDraft={toggleResultDraft}
                    onReorderRanks={reorderResultRanks}
                    setDragSourceParticipantKey={setDragSourceParticipantKey}
                    setDragOverParticipantKey={setDragOverParticipantKey}
                  />
                );
              })}
            </ul>
          </>
        ) : marshalInline && m ? (
          <>
            <ul className="mt-1 space-y-0.5">
              {teams.flatMap((team, index) => {
                const lane = index + 1;
                const clubSecondary = secondaryClubLabelForTeamRow(
                  team.teamName,
                  team.clubName
                );
                const memberParts =
                  apiHeat?.participants?.filter(
                    (p) =>
                      p.participantType === "TEAM" &&
                      p.teamEntryId === team.teamEntryId &&
                      p.lane === lane
                  ) ?? [];
                const rows =
                  memberParts.length > 0
                    ? memberParts
                    : [undefined as HeatMarshalParticipant | undefined];
                return rows.map((participant, subIdx) => {
                  const serverSt =
                    participant != null
                      ? statusByKey?.[marshalParticipantKey(participant)]
                      : foldTeamServerStatusFromMemberKeys(team.teamEntryId, statusByKey);
                  const nameContent =
                    participant != null ? (
                      <p className="font-medium">{participant.label}</p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {team.teamName}
                          {clubSecondary ? (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              ({clubSecondary})
                            </span>
                          ) : null}
                        </p>
                        {team.members.length > 0 && (
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {team.members.join(" / ")}
                          </div>
                        )}
                      </>
                    );
                  return (
                    <LiveRoundMarshalLaneRow
                      key={`${eventId}-team-${heatIndex}-${team.teamEntryId}-${subIdx}`}
                      marshal={m}
                      apiHeatForHeat={apiHeat}
                      displayHeatNumber={displayHeatNumber}
                      laneNumber={lane}
                      laneIndex0={index}
                      nameContent={nameContent}
                      rowKey={`${eventId}-team-${heatIndex}-${team.teamEntryId}-${subIdx}`}
                      serverStatus={serverSt}
                      participantOverride={participant ?? undefined}
                      marshalBulkSubmitting={marshalBulkSubmitting}
                      marshalPendingKey={marshalPendingKey}
                      marshalDraftErrors={marshalDraftErrors}
                      onToggleDraft={queueMarshalDraftToggle}
                    />
                  );
                });
              })}
            </ul>
          </>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {teams.map((team, index) => {
              const lane = index + 1;
              const clubSecondary = secondaryClubLabelForTeamRow(
                team.teamName,
                team.clubName
              );
              const mp =
                m && !m.loading && apiHeat
                  ? marshalParticipantForLane(apiHeat, lane, index)
                  : undefined;
              const serverSt = foldTeamServerStatusFromMemberKeys(
                team.teamEntryId,
                statusByKey
              );
              const displayStatus = resolveHeatLaneDayOpsDisplayStatus(mp, serverSt);
              const mClass = marshalDisplayClass(displayStatus);
              const called = displayStatus === "CALLED";
              const laneTitle =
                called
                  ? "召集済み"
                  : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
                    ? dayOpsParticipantStatusLabelJa(displayStatus)
                    : undefined;
              return (
                <LaneRow
                  key={`${eventId}-team-${heatIndex}-${team.teamEntryId}`}
                  laneNumber={lane}
                  contentClassName={cn(mClass, called && "font-semibold")}
                  contentTitle={laneTitle}
                >
                  <StartListParticipantRowBody status={displayStatus}>
                    <>
                      <p className="font-medium">
                        {team.teamName}
                        {clubSecondary ? (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            ({clubSecondary})
                          </span>
                        ) : null}
                      </p>
                      {team.members.length > 0 && (
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {team.members.join(" / ")}
                        </div>
                      )}
                    </>
                  </StartListParticipantRowBody>
                </LaneRow>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const individuals = heatItems as IndividualItem[];

  const heatCallClosed = Boolean(apiHeat?.callClosedAt);
    const heatCloseDisabled =
      !m ||
      m.loading ||
      !apiHeat ||
      m.marshalOpsBlocked ||
      marshalRoundMismatch ||
      m.isCallClosed ||
      heatCallClosed;
    const heatReopenDisabled =
      !m ||
      m.loading ||
      !apiHeat ||
      m.marshalOpsBlocked ||
      marshalRoundMismatch ||
      Boolean(apiHeat?.marshalReopenBlocked);
    const heatConfirmedForSort = localConfirmedHeats.includes(displayHeatNumber);
    const calledForResultConfirm = countCalledInMarshalHeat(apiHeat);
    const rankOkCount = countOkRanksForHeat(localResultRows, displayHeatNumber, apiHeat);
    const runUpCount = countRunUpForHeat(localResultRows, displayHeatNumber, apiHeat);
    const resultDraftCount = countResultDraftsForHeat(displayHeatNumber);
    const eliminationStyle = isEliminationStyleResultInput(heatAdvanceQuota ?? null, resultInputOrder);
    const elimSlots = eliminationStyle
      ? eliminationSlots({ called: calledForResultConfirm, quota: heatAdvanceQuota ?? null })
      : null;
    const canTieInHeat = rankOkCount > 0;
    const heatResultRanksComplete = isHeatResultReadyForConfirm({
      called: calledForResultConfirm,
      quota: heatAdvanceQuota ?? null,
      rankedCount: rankOkCount,
      runUpCount,
      resultDraftCount,
      usesElimination: eliminationStyle,
    });
    const runUpApplyEnabled = canApplyRunUp({
      called: calledForResultConfirm,
      quota: heatAdvanceQuota ?? null,
      rankedCount: rankOkCount,
      runUpCount,
      resultDraftCount,
    });
    const indForResult = heatConfirmedForSort
      ? orderIndividualItemsByConfirmedResultRank(individuals, displayHeatNumber, localResultRows)
      : individuals;
    return (
      <div
        key={`${eventId}-heat-${heatIndex}`}
        className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <p className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            ヒート {displayHeatNumber}（{individuals.length}件）
            {typeof heatAdvanceQuota === "number" ? (
              <HeatAdvanceQuotaLabel
                quota={heatAdvanceQuota}
                resultCaptureVisible={resultCaptureVisible}
                rankOkCount={rankOkCount}
                runUpCount={runUpCount}
                calledCount={calledForResultConfirm}
                hasApiHeat={Boolean(apiHeat)}
              />
            ) : null}
            {(showMarshalAdminUi || resultCaptureVisible) &&
            !m?.loading &&
            !apiHeat &&
            !marshalRoundMismatch ? (
              <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-300">
                · スナップショットに未登録（マーシャル・リザルト記録不可）
              </span>
            ) : null}
          </p>
          {(resultCaptureVisible && m && resultCapture) || showMarshalAdminUi ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {resultCaptureVisible && m && resultCapture ? (
                <>
                  {localConfirmedHeats.includes(displayHeatNumber) ? (
                    <span className="rounded bg-violet-200/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      リザルト確定済み
                    </span>
                  ) : null}
                  {!localConfirmedHeats.includes(displayHeatNumber) && resultDraftCount > 0 ? (
                    <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      未確定 {resultDraftCount}件
                    </span>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) &&
                  runUpCount > 0 ? (
                    <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                      ランアップ {runUpCount}名
                    </span>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) &&
                  runUpCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        m.loading ||
                        resultCapture.loading ||
                        resultCapture.locked ||
                        m.marshalOpsBlocked ||
                        marshalRoundMismatch ||
                        !apiHeat ||
                        !heatCallClosed ||
                        heatResultConfirmBusy ||
                        runUpBusy
                      }
                      onClick={() => setClearRunUpTarget(displayHeatNumber)}
                    >
                      ランアップ解除
                    </Button>
                  ) : null}
                  {eliminationStyle &&
                  !localConfirmedHeats.includes(displayHeatNumber) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        m.loading ||
                        resultCapture.loading ||
                        resultCapture.locked ||
                        m.marshalOpsBlocked ||
                        marshalRoundMismatch ||
                        !apiHeat ||
                        !heatCallClosed ||
                        heatResultConfirmBusy ||
                        runUpBusy ||
                        !runUpApplyEnabled
                      }
                      onClick={() => setRunUpTarget(displayHeatNumber)}
                    >
                      残りをランアップ
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={
                      m.loading ||
                      resultCapture.loading ||
                      resultCapture.locked ||
                      m.marshalOpsBlocked ||
                      marshalRoundMismatch ||
                      !apiHeat ||
                      !heatCallClosed ||
                      localConfirmedHeats.includes(displayHeatNumber) ||
                      heatResultConfirmBusy ||
                      runUpBusy ||
                      !heatResultRanksComplete
                    }
                    onClick={() => setHeatResultConfirmTarget(displayHeatNumber)}
                  >
                    リザルト確定
                  </Button>
                  <Button
                    type="button"
                    variant={
                      tieNextHeatIndex === displayHeatNumber ? "default" : "outline"
                    }
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={
                      m.loading ||
                      resultCapture.loading ||
                      resultCapture.locked ||
                      m.marshalOpsBlocked ||
                      marshalRoundMismatch ||
                      !apiHeat ||
                      !heatCallClosed ||
                      localConfirmedHeats.includes(displayHeatNumber) ||
                      !canTieInHeat
                    }
                    onClick={() =>
                      setTieNextHeatIndex((prev) =>
                        prev === displayHeatNumber ? null : displayHeatNumber
                      )
                    }
                  >
                    次を同着
                  </Button>
                </>
              ) : null}
              {showMarshalAdminUi ? (
                <>
                  {heatCallClosed ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:bg-amber-950/80 dark:text-amber-100">
                      締切済み
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-100">
                      受付中
                    </span>
                  )}
                  {showMarshalHeatControls ? (
                    heatCallClosed ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={heatReopenDisabled}
                        title={
                          apiHeat?.marshalReopenBlocked
                            ? "公式リザルトがあるヒートは受付中に戻せません"
                            : undefined
                        }
                        onClick={() => setHeatReopenTarget(displayHeatNumber)}
                      >
                        受付中に戻す
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={heatCloseDisabled}
                        onClick={() => setHeatCloseTarget(displayHeatNumber)}
                      >
                        マーシャル締切
                      </Button>
                    )
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {(m?.loading || (resultCaptureVisible && resultCapture?.loading)) ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {resultCaptureVisible && resultCapture?.loading && !m?.loading
              ? "リザルト記録状況を読み込み中…"
              : "マーシャル状態を読み込み中…"}
          </p>
        ) : null}
        {resultCaptureVisible &&
        m &&
        resultCapture &&
        apiHeat &&
        !heatCallClosed &&
        !localConfirmedHeats.includes(displayHeatNumber) ? (
          <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
            マーシャル締切後にリザルトを記録できます。「マーシャル締切」を実行してください。
          </p>
        ) : null}
        {resultCaptureVisible &&
        m &&
        resultCapture &&
        !heatConfirmedForSort &&
        apiHeat &&
        calledForResultConfirm > 0 &&
        !heatResultRanksComplete ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
            {eliminationStyle ? (
              <>
                脱落着順 {rankOkCount}
                {elimSlots ? ` / ${elimSlots.eliminationTarget}` : ""} 名・ランアップ {runUpCount}
                {elimSlots ? ` / ${elimSlots.runUpTarget}` : ""} 名（未確定チェック {resultDraftCount}{" "}
                件）。下位から脱落を記録し、「残りをランアップ」してから確定してください。
              </>
            ) : (
              <>
                召集済み {calledForResultConfirm} 名のうち、着順入力済み {rankOkCount} 件・未確定{" "}
                {resultDraftCount} 件です。全員分が反映されるまでリザルト確定はできません。
              </>
            )}
          </p>
        ) : null}
        {resultCaptureVisible && m && resultCapture ? (
          <>
            <ul className="mt-1 space-y-0.5">
              {(heatConfirmedForSort
                ? indForResult.map((item, index) => ({
                    item,
                    originalIndex: individuals.findIndex((x) => x.entryId === item.entryId),
                    fallbackIndex: index,
                  }))
                : indForResult
                    .map((item, index) => {
                      const originalIndex = individuals.findIndex((x) => x.entryId === item.entryId);
                      const fallbackLane = originalIndex >= 0 ? originalIndex + 1 : index + 1;
                      const rankForSort = localResultRows.find(
                        (r) =>
                          r.heat === displayHeatNumber &&
                          r.entryType === "INDIVIDUAL" &&
                          r.competitionEntryId === item.entryId &&
                          r.rank != null
                      )?.rank;
                      return {
                        item,
                        originalIndex,
                        fallbackIndex: index,
                        laneForSort: snapshotLaneForIndividual(apiHeat, item.entryId, fallbackLane),
                        rankForSort: rankForSort ?? null,
                      };
                    })
                    .sort((a, b) => {
                      const ar = a.rankForSort;
                      const br = b.rankForSort;
                      if (ar != null && br != null) {
                        if (ar !== br) {
                          return resultInputOrder === "asc" ? ar - br : br - ar;
                        }
                        return a.laneForSort - b.laneForSort;
                      }
                      if (ar != null || br != null) {
                        return ar != null ? -1 : 1;
                      }
                      return resultInputOrder === "asc"
                        ? a.laneForSort - b.laneForSort
                        : b.laneForSort - a.laneForSort;
                    })).map(({ item, originalIndex, fallbackIndex }) => {
                const fallLane = originalIndex >= 0 ? originalIndex + 1 : fallbackIndex + 1;
                const snapLane = snapshotLaneForIndividual(apiHeat, item.entryId, fallLane);
                const laneIndex0 = originalIndex >= 0 ? originalIndex : fallbackIndex;
                return (
                  <LiveRoundResultLaneRow
                    key={`${eventId}-ind-${heatIndex}-${item.entryId}-${laneIndex0}`}
                    marshal={m}
                    resultCapture={resultCapture}
                    apiHeatForHeat={apiHeat}
                    displayHeatNumber={displayHeatNumber}
                    laneNumber={snapLane}
                    laneIndex0={laneIndex0}
                    nameContent={individualLiveRowLabel(item.name, item.clubName)}
                    rowKey={`${eventId}-ind-${heatIndex}-${item.entryId}-${laneIndex0}`}
                    serverStatus={statusByKey?.[marshalIndividualKey(item.entryId)]}
                    participantRankKey={marshalIndividualKey(item.entryId)}
                    localResultRows={localResultRows}
                    localConfirmedHeats={localConfirmedHeats}
                    resultDraftOps={resultDraftOps}
                    resultDraftErrors={resultDraftErrors}
                    resultInputOrder={resultInputOrder}
                    tieNextHeatIndex={tieNextHeatIndex}
                    resultCapturePendingKey={resultCapturePendingKey}
                    dragSourceParticipantKey={dragSourceParticipantKey}
                    dragOverParticipantKey={dragOverParticipantKey}
                    onToggleDraft={toggleResultDraft}
                    onReorderRanks={reorderResultRanks}
                    setDragSourceParticipantKey={setDragSourceParticipantKey}
                    setDragOverParticipantKey={setDragOverParticipantKey}
                  />
                );
              })}
            </ul>
          </>
        ) : marshalInline && m ? (
          <>
            <ul className="mt-1 space-y-0.5">
              {individuals.map((item, index) => (
                <LiveRoundMarshalLaneRow
                  key={`${eventId}-ind-${heatIndex}-${item.entryId}`}
                  marshal={m}
                  apiHeatForHeat={apiHeat}
                  displayHeatNumber={displayHeatNumber}
                  laneNumber={index + 1}
                  laneIndex0={index}
                  nameContent={individualLiveRowLabel(item.name, item.clubName)}
                  rowKey={`${eventId}-ind-${heatIndex}-${item.entryId}`}
                  serverStatus={statusByKey?.[marshalIndividualKey(item.entryId)]}
                  marshalBulkSubmitting={marshalBulkSubmitting}
                  marshalPendingKey={marshalPendingKey}
                  marshalDraftErrors={marshalDraftErrors}
                  onToggleDraft={queueMarshalDraftToggle}
                />
              ))}
            </ul>
          </>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {individuals.map((item, index) => {
              const lane = index + 1;
              const mp =
                m && !m.loading && apiHeat
                  ? marshalParticipantForLane(apiHeat, lane, index)
                  : undefined;
              const serverSt = statusByKey?.[marshalIndividualKey(item.entryId)];
              const displayStatus = resolveHeatLaneDayOpsDisplayStatus(mp, serverSt);
              const mClass = marshalDisplayClass(displayStatus);
              const called = displayStatus === "CALLED";
              const laneTitle =
                called
                  ? "召集済み"
                  : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
                    ? dayOpsParticipantStatusLabelJa(displayStatus)
                    : undefined;
              return (
                <LaneRow
                  key={`${eventId}-ind-${heatIndex}-${item.entryId}`}
                  laneNumber={lane}
                  contentClassName={cn(mClass, called && "font-semibold")}
                  contentTitle={laneTitle}
                >
                  <StartListParticipantRowBody status={displayStatus}>
                    {individualLiveRowLabel(item.name, item.clubName)}
                  </StartListParticipantRowBody>
                </LaneRow>
              );
            })}
          </ul>
        )}
      </div>
    );
}
