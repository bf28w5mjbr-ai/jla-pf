"use client";

import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import { isDayOpsTerminalParticipantStatus } from "@/lib/dayOpsParticipantStatusDisplay";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { cn } from "@/lib/utils";

export type MarshalResultPayload = {
  lane: number;
  label: string;
  clubName: string | null;
  alreadyMarshalled: boolean;
};

export type MarshalDraftTogglePayload = {
  opKey: string;
  participant: HeatMarshalParticipant;
  heatIndex: number;
  targetStatus: "CALLED" | "PENDING";
};

/** スタートリストのレーン行左側に置くマーシャルチェック */
export function MarshalStartListLaneCheckbox({
  participant,
  heatIndex,
  marshalDialogBlocked,
  marshalPendingKey,
  onToggleDraft,
  draftError,
  /** 締切前は召集済みチェックを外して PENDING に戻せる */
  allowUnsetCalled = false,
}: {
  participant: HeatMarshalParticipant | undefined;
  heatIndex: number;
  marshalDialogBlocked: boolean;
  marshalPendingKey: string | null;
  onToggleDraft: (payload: MarshalDraftTogglePayload) => void;
  draftError?: string;
  allowUnsetCalled?: boolean;
}) {
  if (!participant) {
    return <span className="inline-block w-4 shrink-0" aria-hidden />;
  }

  const p = participant;
  const pKey = marshalParticipantKey(p);
  const done = isCalledLikeStatus(p.status);
  const isTerminal = isDayOpsTerminalParticipantStatus(p.status);
  const globallyBusy = marshalPendingKey !== null;
  const rowBusy = marshalPendingKey === pKey;
  const checkboxDisabled =
    marshalDialogBlocked || globallyBusy || isTerminal || (done && !allowUnsetCalled);
  const inputId = `sl-marshal-h${heatIndex}-L${p.lane}-${pKey.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxSize = "size-3.5";

  return (
    <div className="mt-0.5 grid size-3.5 shrink-0 place-items-center self-start">
      <Checkbox
        id={inputId}
        checked={done}
        disabled={checkboxDisabled}
        className={cn(
          "col-start-1 row-start-1",
          boxSize,
          "rounded-[5px] [&_svg]:size-2.5",
          done &&
            "border-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600",
          rowBusy && "invisible",
          draftError && "border-destructive"
        )}
        onCheckedChange={(checked) => {
          if (checked === true) {
            if (done) return;
            onToggleDraft({ opKey: pKey, participant: p, heatIndex, targetStatus: "CALLED" });
            return;
          }
          if (checked === false && done && allowUnsetCalled) {
            onToggleDraft({ opKey: pKey, participant: p, heatIndex, targetStatus: "PENDING" });
          }
        }}
      />
      {rowBusy ? (
        <Loader2 className="col-start-1 row-start-1 size-3.5 animate-spin text-primary" aria-hidden />
      ) : null}
      {draftError ? <span className="sr-only">{draftError}</span> : null}
    </div>
  );
}
