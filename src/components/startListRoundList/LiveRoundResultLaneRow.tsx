"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  marshalParticipantKey,
  type HeatMarshalHeatRow,
} from "@/components/HeatMarshalLanePanel";
import { ResultStartListLaneCheckbox } from "@/components/ResultStartListWidgets";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  dayOpsParticipantStatusLabelJa,
  dayOpsTerminalStatusBadgeClass,
  isDayOpsTerminalParticipantStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { cn } from "@/lib/utils";
import {
  marshalDisplayClass,
  marshalParticipantForLane,
  participantHasRunUpInHeat,
  provisionalResultRankForParticipant,
  resultRankForParticipant,
} from "./panelHelpers";
import type { LiveRoundContentProps } from "./types";
import type { ResultDraftOp } from "@/hooks/liveRound/types";

type StartListMarshal = NonNullable<LiveRoundContentProps["startListMarshal"]>;
type ResultCapture = NonNullable<StartListMarshal["resultCapture"]>;

export type LiveRoundResultLaneRowProps = {
  marshal: StartListMarshal;
  resultCapture: ResultCapture;
  apiHeatForHeat: HeatMarshalHeatRow | undefined;
  displayHeatNumber: number;
  laneNumber: number;
  laneIndex0: number;
  nameContent: ReactNode;
  rowKey: string;
  serverStatus: string | undefined;
  participantRankKey: string | null;
  localResultRows: HeatResultCaptureRow[];
  localConfirmedHeats: number[];
  resultDraftOps: Record<string, ResultDraftOp>;
  resultDraftErrors: Record<string, string>;
  resultInputOrder: "asc" | "desc";
  tieNextHeatIndex: number | null;
  resultCapturePendingKey: string | null;
  dragSourceParticipantKey: string | null;
  dragOverParticipantKey: string | null;
  onToggleDraft: Parameters<typeof ResultStartListLaneCheckbox>[0]["onToggleDraft"];
  rankOrderKeys: string[];
  onReorderOrder: (heatIndex: number, sourceKey: string, targetKey: string) => void | Promise<void>;
  setDragSourceParticipantKey: (key: string | null) => void;
  setDragOverParticipantKey: (key: string | null) => void;
};

export function LiveRoundResultLaneRow({
  marshal,
  resultCapture: rc,
  apiHeatForHeat,
  displayHeatNumber,
  laneNumber,
  laneIndex0,
  nameContent,
  rowKey,
  serverStatus,
  participantRankKey,
  localResultRows,
  localConfirmedHeats,
  resultDraftOps,
  resultDraftErrors,
  resultInputOrder,
  tieNextHeatIndex,
  resultCapturePendingKey,
  dragSourceParticipantKey,
  dragOverParticipantKey,
  onToggleDraft,
  rankOrderKeys,
  onReorderOrder,
  setDragSourceParticipantKey,
  setDragOverParticipantKey,
}: LiveRoundResultLaneRowProps) {
  const coarsePointer = useCoarsePointer();
  const participant = marshalParticipantForLane(apiHeatForHeat, laneNumber, laneIndex0);
  const displayStatus = resolveHeatLaneDayOpsDisplayStatus(participant, serverStatus);
  const serverRk = resultRankForParticipant(displayHeatNumber, participant, localResultRows);
  const provisionalRk = provisionalResultRankForParticipant(
    displayHeatNumber,
    participant,
    apiHeatForHeat,
    localResultRows,
    resultDraftOps,
    resultInputOrder
  );
  const displayRk = serverRk ?? provisionalRk;
  const hasRunUp = participantHasRunUpInHeat(displayHeatNumber, participant, localResultRows);
  const heatConfirmed = localConfirmedHeats.includes(displayHeatNumber);
  const heatMarshalClosed = Boolean(apiHeatForHeat?.callClosedAt);
  const captureBlocked =
    marshal.marshalOpsBlocked ||
    marshal.marshalRoundMismatch ||
    rc.locked ||
    heatConfirmed ||
    !heatMarshalClosed ||
    hasRunUp;
  const st = displayStatus;
  const terminalResult = Boolean(st && isDayOpsTerminalParticipantStatus(st));
  const leftColumnContent =
    hasRunUp ? (
      <span
        className="text-[10px] font-semibold text-violet-800 dark:text-violet-200"
        title="着順なしで次ラ進出（ランアップ）"
      >
        進出
      </span>
    ) : heatConfirmed && serverRk != null ? (
      <span className="text-violet-800 dark:text-violet-200">{serverRk}位</span>
    ) : heatConfirmed ? (
      <span className="text-muted-foreground" title={`スタートレーン ${laneNumber}（着順記録なし）`}>
        L{laneNumber}
      </span>
    ) : displayRk != null ? (
      <span
        className={cn(
          "tabular-nums",
          serverRk != null
            ? "text-violet-800 dark:text-violet-200"
            : "text-violet-700/90 dark:text-violet-300/90"
        )}
        title={
          serverRk != null ? undefined : "未保存の仮表示です。「リザルト確定」でデータベースに反映されます"
        }
      >
        {displayRk}位
      </span>
    ) : (
      laneNumber
    );
  const showRankBadgeInline = displayRk != null && !heatConfirmed;
  const draftChecked = participant
    ? Boolean(resultDraftOps[marshalParticipantKey(participant)])
    : false;
  const rowDataPending =
    !participant && !heatConfirmed && (marshal.loading || rc.loading);
  const inRankOrder =
    participantRankKey != null && rankOrderKeys.includes(participantRankKey);
  const canReorderRank = Boolean(
    inRankOrder &&
      !heatConfirmed &&
      !rowDataPending &&
      !captureBlocked
  );
  const canDragRank = canReorderRank && !coarsePointer;
  const rankOrderIndex =
    participantRankKey != null ? rankOrderKeys.indexOf(participantRankKey) : -1;
  const canMoveRankUp = canReorderRank && rankOrderIndex > 0;
  const canMoveRankDown =
    canReorderRank && rankOrderIndex >= 0 && rankOrderIndex < rankOrderKeys.length - 1;

  const moveRank = (direction: "up" | "down") => {
    if (!participantRankKey || rankOrderIndex < 0) return;
    const targetIdx = direction === "up" ? rankOrderIndex - 1 : rankOrderIndex + 1;
    const targetKey = rankOrderKeys[targetIdx];
    if (!targetKey) return;
    void onReorderOrder(displayHeatNumber, participantRankKey, targetKey);
  };

  return (
    <li
      key={rowKey}
      className={cn(
        "flex items-start gap-1.5",
        canDragRank && "cursor-move rounded-sm border border-transparent hover:border-violet-300/70",
        canDragRank &&
          dragOverParticipantKey === participantRankKey &&
          "border-violet-400/90 bg-violet-50/70 dark:border-violet-700/90 dark:bg-violet-950/30"
      )}
      draggable={canDragRank}
      title={
        canDragRank
          ? "ドラッグして着順を並べ替え"
          : canReorderRank && coarsePointer
            ? "矢印で着順を並べ替え"
            : undefined
      }
      onDragStart={() => {
        if (!canDragRank || !participantRankKey) return;
        setDragSourceParticipantKey(participantRankKey);
        setDragOverParticipantKey(participantRankKey);
      }}
      onDragEnd={() => {
        setDragSourceParticipantKey(null);
        setDragOverParticipantKey(null);
      }}
      onDragOver={(e) => {
        if (!canDragRank || !dragSourceParticipantKey || !participantRankKey) return;
        e.preventDefault();
        setDragOverParticipantKey(participantRankKey);
      }}
      onDragLeave={() => {
        if (!canDragRank) return;
        setDragOverParticipantKey(null);
      }}
      onDrop={(e) => {
        if (!canDragRank || !dragSourceParticipantKey || !participantRankKey) return;
        e.preventDefault();
        void onReorderOrder(displayHeatNumber, dragSourceParticipantKey, participantRankKey);
        setDragSourceParticipantKey(null);
        setDragOverParticipantKey(null);
      }}
    >
      {rowDataPending ? (
        <span className="mt-1 size-3.5 shrink-0 animate-pulse rounded bg-muted" aria-hidden />
      ) : heatConfirmed ? (
        <span
          className="mt-0.5 grid size-3.5 shrink-0 place-items-center self-start text-violet-700 dark:text-violet-300"
          title="リザルト確定済み（変更不可）"
        >
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
          <span className="sr-only">リザルト確定済み</span>
        </span>
      ) : (
        <ResultStartListLaneCheckbox
          participant={participant}
          serverDayOpsStatus={serverStatus}
          heatIndex={displayHeatNumber}
          captureBlocked={captureBlocked}
          capturePendingKey={resultCapturePendingKey}
          resultRows={localResultRows}
          onToggleDraft={onToggleDraft}
          draftChecked={draftChecked}
          draftError={participant ? resultDraftErrors[marshalParticipantKey(participant)] : undefined}
          tieWithPrevious={tieNextHeatIndex === displayHeatNumber}
          inputOrder={resultInputOrder}
        />
      )}
      <span
        className={cn(
          "mt-0.5 shrink-0 min-w-[2.25rem] text-right text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400",
          heatConfirmed && serverRk != null && "text-violet-800 dark:text-violet-200",
          !heatConfirmed && displayRk != null && "text-violet-800 dark:text-violet-200"
        )}
        aria-label={
          heatConfirmed && serverRk != null
            ? `確定着順 ${serverRk}位、スタートレーン ${laneNumber}`
            : heatConfirmed
              ? `スタートレーン ${laneNumber}、着順は記録されていません`
              : displayRk != null
                ? `仮着順 ${displayRk}位、スタートレーン ${laneNumber}`
                : `スタートレーン ${laneNumber}`
        }
      >
        {leftColumnContent}
      </span>
      <div
        className={cn(
          "min-w-0 flex-1 text-[13px] leading-snug",
          marshalDisplayClass(displayStatus),
          displayRk != null && !heatConfirmed && "font-semibold text-violet-800 dark:text-violet-200",
          heatConfirmed && serverRk != null && "font-semibold"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              {nameContent}
              {showRankBadgeInline ? (
                <span
                  className={cn(
                    "rounded px-1 py-0 text-[10px] font-bold tabular-nums",
                    serverRk != null
                      ? "bg-violet-100 text-violet-950 dark:bg-violet-900/80 dark:text-violet-50"
                      : "border border-dashed border-violet-400/70 bg-violet-50/80 text-violet-900 dark:border-violet-600/70 dark:bg-violet-950/50 dark:text-violet-100"
                  )}
                  title={
                    serverRk == null && provisionalRk != null
                      ? "仮表示（リザルト確定で正式記録）"
                      : undefined
                  }
                >
                  {displayRk}位{serverRk == null && provisionalRk != null ? "（仮）" : ""}
                </span>
              ) : null}
            </div>
          </div>
          {terminalResult && st ? (
            <span
              className={cn(
                "inline-flex shrink-0 self-start rounded border px-1 py-px text-[10px] font-semibold tabular-nums leading-tight",
                dayOpsTerminalStatusBadgeClass(st)
              )}
            >
              {dayOpsParticipantStatusLabelJa(st)}
            </span>
          ) : null}
        </div>
      </div>
      {canReorderRank && coarsePointer ? (
        <div className="mt-0.5 flex shrink-0 flex-col gap-0.5 self-start">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0 rounded-md border-violet-300/80 bg-background/90 dark:border-violet-800"
            disabled={!canMoveRankUp}
            aria-label="着順を上げる"
            title="着順を上げる"
            onClick={() => moveRank("up")}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0 rounded-md border-violet-300/80 bg-background/90 dark:border-violet-800"
            disabled={!canMoveRankDown}
            aria-label="着順を下げる"
            title="着順を下げる"
            onClick={() => moveRank("down")}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
