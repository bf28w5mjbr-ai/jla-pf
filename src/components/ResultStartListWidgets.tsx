"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import { postHeatResultCaptureAppend } from "@/lib/heatResultCaptureApi";
import {
  isDayOpsTerminalParticipantStatus,
  isMarshalAbsentDisplayStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { cn } from "@/lib/utils";

type MarshalRoundKey = "HEAT" | "SEMI" | "FINAL";

function rankForParticipant(
  heatIndex1Based: number,
  participant: HeatMarshalParticipant | undefined,
  rows: Array<{
    heat: number | null;
    rank: number | null;
    entryType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
  }>
): number | null {
  if (!participant) return null;
  const match = rows.find((r) => {
    if (r.heat !== heatIndex1Based || r.rank == null) return false;
    if (participant.participantType === "INDIVIDUAL") {
      return r.entryType === "INDIVIDUAL" && r.competitionEntryId === participant.competitionEntryId;
    }
    return r.entryType === "TEAM" && r.teamEntryId === participant.teamEntryId;
  });
  return match?.rank ?? null;
}

/** リザルトモード: ヒート内の入力順で着順を記録 */
export function ResultStartListLaneCheckbox({
  participant,
  heatIndex,
  competitionId,
  eventId,
  resultRound,
  captureBlocked,
  capturePendingKey,
  setCapturePendingKey,
  resultRows,
  onRankRecorded,
  tieWithPrevious = false,
  inputOrder = "asc",
  serverDayOpsStatus,
}: {
  participant: HeatMarshalParticipant | undefined;
  /** ページ SSR の参加者ステータス（マーシャル一覧より新しい CALLED と整合させる） */
  serverDayOpsStatus?: string | undefined;
  heatIndex: number;
  competitionId: string;
  eventId: string;
  resultRound: MarshalRoundKey;
  captureBlocked: boolean;
  capturePendingKey: string | null;
  setCapturePendingKey: (k: string | null) => void;
  resultRows: Array<{
    heat: number | null;
    rank: number | null;
    entryType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
  }>;
  onRankRecorded: (payload: {
    heatIndex: number;
    lane: number;
    rank: number;
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId: string | null;
    teamEntryId: string | null;
  }) => void;
  tieWithPrevious?: boolean;
  inputOrder?: "asc" | "desc";
}) {
  if (!participant) {
    return <span className="inline-block w-4 shrink-0" aria-hidden />;
  }

  const p = participant;
  const pKey = marshalParticipantKey(p);
  const rank = rankForParticipant(heatIndex, p, resultRows);
  const hasRank = rank != null;
  const mergedStatus = resolveHeatLaneDayOpsDisplayStatus(p, serverDayOpsStatus);
  const isTerminal = Boolean(mergedStatus && isDayOpsTerminalParticipantStatus(mergedStatus));
  /** マーシャル GET の行のみで判定（ポールの CALLED だけでは有効にしない） */
  const marshalReady = p.status === "CALLED";
  const globallyBusy = capturePendingKey !== null;
  const rowBusy = capturePendingKey === pKey;
  const checkboxDisabled =
    captureBlocked || globallyBusy || isTerminal || hasRank || !marshalReady;
  const inputId = `sl-result-h${heatIndex}-L${p.lane}-${pKey.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxSize = "size-3.5";

  const marshalBlockTitle =
    isMarshalAbsentDisplayStatus(mergedStatus)
      ? "マーシャル締切により未出場扱いのためリザルトを記録できません（競技中の失格 DSQ とは別）"
      : !marshalReady && !isTerminal && !hasRank
        ? "マーシャル一覧で召集済み（CALLED）になるまでリザルトを記録できません"
        : undefined;

  return (
    <div
      className="mt-0.5 grid size-3.5 shrink-0 place-items-center self-start"
      title={marshalBlockTitle}
    >
      <Checkbox
        id={inputId}
        checked={hasRank}
        disabled={checkboxDisabled}
        className={cn(
          "col-start-1 row-start-1",
          boxSize,
          "rounded-[5px] [&_svg]:size-2.5",
          hasRank &&
            "border-violet-600 data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600",
          rowBusy && "invisible"
        )}
        onCheckedChange={(checked) => {
          if (checked !== true || hasRank) return;
          void (async () => {
            setCapturePendingKey(pKey);
            try {
              const data = await postHeatResultCaptureAppend(competitionId, {
                mode: "manual",
                eventId,
                round: resultRound,
                heatIndex,
                tieWithPrevious,
                inputOrder,
                participantType: p.participantType,
                competitionEntryId:
                  p.participantType === "INDIVIDUAL" ? p.competitionEntryId ?? undefined : undefined,
                teamEntryId: p.participantType === "TEAM" ? p.teamEntryId ?? undefined : undefined,
              });
              onRankRecorded({
                heatIndex,
                lane: data.lane,
                rank: data.rank,
                participantType: p.participantType,
                competitionEntryId: p.participantType === "INDIVIDUAL" ? p.competitionEntryId ?? null : null,
                teamEntryId: p.participantType === "TEAM" ? p.teamEntryId ?? null : null,
              });
              toast.success(`着順 ${data.rank} 位を記録しました`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "記録に失敗しました");
            } finally {
              setCapturePendingKey(null);
            }
          })();
        }}
      />
      {rowBusy ? (
        <Loader2 className="col-start-1 row-start-1 size-3.5 animate-spin text-primary" aria-hidden />
      ) : null}
    </div>
  );
}
