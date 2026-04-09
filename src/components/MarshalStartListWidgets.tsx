"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import { postHeatMarshalComplete, postMarshalRevertPending } from "@/lib/heatMarshalApi";
import { isDayOpsTerminalParticipantStatus } from "@/lib/dayOpsParticipantStatusDisplay";
import { cn } from "@/lib/utils";

type MarshalRoundKey = "HEAT" | "SEMI" | "FINAL";

export type MarshalResultPayload = {
  lane: number;
  label: string;
  clubName: string | null;
  alreadyMarshalled: boolean;
};

/** スタートリストのレーン行左側に置くマーシャルチェック */
export function MarshalStartListLaneCheckbox({
  participant,
  heatIndex,
  competitionId,
  eventId,
  marshalRound,
  marshalDialogBlocked,
  marshalPendingKey,
  setMarshalPendingKey,
  onMarshalResult,
  onLaneCalled,
  /** 締切前は召集済みチェックを外して PENDING に戻せる */
  allowUnsetCalled = false,
  onUnsetCalled,
}: {
  participant: HeatMarshalParticipant | undefined;
  heatIndex: number;
  competitionId: string;
  eventId: string;
  marshalRound: MarshalRoundKey;
  marshalDialogBlocked: boolean;
  marshalPendingKey: string | null;
  setMarshalPendingKey: (k: string | null) => void;
  onMarshalResult: (r: MarshalResultPayload) => void;
  onLaneCalled: (lane: number) => void;
  allowUnsetCalled?: boolean;
  onUnsetCalled?: (lane: number) => void;
}) {
  if (!participant) {
    return <span className="inline-block w-4 shrink-0" aria-hidden />;
  }

  const p = participant;
  const pKey = marshalParticipantKey(p);
  const done = p.status === "CALLED";
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
          rowBusy && "invisible"
        )}
        onCheckedChange={(checked) => {
          if (checked === true) {
            if (done) return;
            void (async () => {
              setMarshalPendingKey(pKey);
              try {
                const data = await postHeatMarshalComplete(competitionId, {
                  mode: "manual",
                  eventId,
                  round: marshalRound,
                  heatIndex,
                  participantType: p.participantType,
                  competitionEntryId:
                    p.participantType === "INDIVIDUAL" ? p.competitionEntryId ?? undefined : undefined,
                  teamEntryId: p.participantType === "TEAM" ? p.teamEntryId ?? undefined : undefined,
                  teamMemberUserId:
                    p.participantType === "TEAM" ? p.teamMemberUserId ?? undefined : undefined,
                });
                const lane = Number(data.lane);
                if (Number.isFinite(lane)) onLaneCalled(lane);
                onMarshalResult({
                  lane,
                  label: String(data.label ?? ""),
                  clubName: typeof data.clubName === "string" ? data.clubName : null,
                  alreadyMarshalled: Boolean(data.alreadyMarshalled),
                });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "マーシャルに失敗しました");
              } finally {
                setMarshalPendingKey(null);
              }
            })();
            return;
          }
          if (checked === false && done && allowUnsetCalled) {
            void (async () => {
              setMarshalPendingKey(pKey);
              try {
                await postMarshalRevertPending(competitionId, {
                  eventId,
                  marshalRound,
                  participantType: p.participantType,
                  competitionEntryId:
                    p.participantType === "INDIVIDUAL" ? p.competitionEntryId ?? undefined : undefined,
                  teamEntryId: p.participantType === "TEAM" ? p.teamEntryId ?? undefined : undefined,
                  teamMemberUserId:
                    p.participantType === "TEAM" ? p.teamMemberUserId ?? null : undefined,
                });
                onUnsetCalled?.(p.lane);
                toast.success("召集を取り消しました（締切前の仮状態）");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "召集の取り消しに失敗しました");
              } finally {
                setMarshalPendingKey(null);
              }
            })();
          }
        }}
      />
      {rowBusy ? (
        <Loader2 className="col-start-1 row-start-1 size-3.5 animate-spin text-primary" aria-hidden />
      ) : null}
    </div>
  );
}
