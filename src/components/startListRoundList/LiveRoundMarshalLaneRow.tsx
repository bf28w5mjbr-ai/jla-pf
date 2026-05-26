"use client";

import type { ReactNode } from "react";
import {
  marshalParticipantKey,
  type HeatMarshalHeatRow,
  type HeatMarshalParticipant,
} from "@/components/HeatMarshalLanePanel";
import { MarshalStartListLaneCheckbox } from "@/components/MarshalStartListWidgets";
import type { MarshalDraftTogglePayload } from "@/components/MarshalStartListWidgets";
import {
  dayOpsParticipantStatusLabelJa,
  isDayOpsTerminalParticipantStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { cn } from "@/lib/utils";
import {
  marshalDisplayClass,
  marshalParticipantForLane,
  StartListParticipantRowBody,
} from "./panelHelpers";
import type { LiveRoundContentProps } from "./types";

type StartListMarshal = NonNullable<LiveRoundContentProps["startListMarshal"]>;

export type LiveRoundMarshalLaneRowProps = {
  marshal: StartListMarshal;
  apiHeatForHeat: HeatMarshalHeatRow | undefined;
  displayHeatNumber: number;
  laneNumber: number;
  laneIndex0: number;
  nameContent: ReactNode;
  rowKey: string;
  serverStatus: string | undefined;
  participantOverride?: HeatMarshalParticipant;
  marshalBulkSubmitting: boolean;
  marshalPendingKey: string | null;
  marshalDraftErrors: Record<string, string>;
  onToggleDraft: (payload: MarshalDraftTogglePayload) => void;
};

export function LiveRoundMarshalLaneRow({
  marshal,
  apiHeatForHeat,
  displayHeatNumber,
  laneNumber,
  laneIndex0,
  nameContent,
  rowKey,
  serverStatus,
  participantOverride,
  marshalBulkSubmitting,
  marshalPendingKey,
  marshalDraftErrors,
  onToggleDraft,
}: LiveRoundMarshalLaneRowProps) {
  const participant =
    participantOverride ?? marshalParticipantForLane(apiHeatForHeat, laneNumber, laneIndex0);
  const displayStatus = resolveHeatLaneDayOpsDisplayStatus(participant, serverStatus);
  const called = displayStatus === "CALLED";
  const heatMarshalBlocked =
    marshal.marshalOpsBlocked ||
    marshal.marshalRoundMismatch ||
    marshal.isCallClosed ||
    Boolean(apiHeatForHeat?.callClosedAt);
  const allowUnsetCalled = !heatMarshalBlocked;
  const rowTitle =
    called
      ? "召集済み"
      : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
        ? dayOpsParticipantStatusLabelJa(displayStatus)
        : undefined;

  return (
    <li key={rowKey} className="flex items-start gap-1.5" title={rowTitle}>
      {marshal.loading ? (
        <span className="mt-1 size-3.5 shrink-0 animate-pulse rounded bg-muted" aria-hidden />
      ) : (
        <MarshalStartListLaneCheckbox
          participant={participant}
          heatIndex={displayHeatNumber}
          marshalDialogBlocked={heatMarshalBlocked}
          marshalPendingKey={marshalBulkSubmitting ? "bulk-commit" : marshalPendingKey}
          onToggleDraft={onToggleDraft}
          draftError={participant ? marshalDraftErrors[marshalParticipantKey(participant)] : undefined}
          allowUnsetCalled={allowUnsetCalled}
        />
      )}
      <span
        className="mt-0.5 shrink-0 w-5 text-right text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400"
        aria-label={`レーン ${laneNumber}`}
      >
        {laneNumber}
      </span>
      <div
        className={cn(
          "min-w-0 flex-1 text-[13px] leading-snug",
          marshalDisplayClass(displayStatus),
          called && "font-semibold"
        )}
      >
        <StartListParticipantRowBody status={displayStatus}>{nameContent}</StartListParticipantRowBody>
      </div>
    </li>
  );
}
