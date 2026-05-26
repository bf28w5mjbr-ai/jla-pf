"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
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
  onReorderRanks: (heatIndex: number, sourceKey: string, targetKey: string) => void | Promise<void>;
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
  onReorderRanks,
  setDragSourceParticipantKey,
  setDragOverParticipantKey,
}: LiveRoundResultLaneRowProps) {
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
  const heatConfirmed = localConfirmedHeats.includes(displayHeatNumber);
  const heatMarshalClosed = Boolean(apiHeatForHeat?.callClosedAt);
  const captureBlocked =
    marshal.marshalOpsBlocked ||
    marshal.marshalRoundMismatch ||
    rc.locked ||
    heatConfirmed ||
    !heatMarshalClosed;
  const st = displayStatus;
  const terminalResult = Boolean(st && isDayOpsTerminalParticipantStatus(st));
  const leftColumnContent =
    heatConfirmed && serverRk != null ? (
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
  const canDragRank = Boolean(
    participantRankKey &&
      serverRk != null &&
      !heatConfirmed &&
      !marshal.loading &&
      !rc.loading &&
      !captureBlocked
  );

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
      title={canDragRank ? "ドラッグして着順を並べ替え" : undefined}
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
        void onReorderRanks(displayHeatNumber, dragSourceParticipantKey, participantRankKey);
        setDragSourceParticipantKey(null);
        setDragOverParticipantKey(null);
      }}
    >
      {marshal.loading || rc.loading ? (
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
          draftChecked={participant ? Boolean(resultDraftOps[marshalParticipantKey(participant)]) : false}
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
    </li>
  );
}
