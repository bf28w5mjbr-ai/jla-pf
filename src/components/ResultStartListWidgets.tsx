"use client";

import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import {
  isDayOpsTerminalParticipantStatus,
  isMarshalAbsentDisplayStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { cn } from "@/lib/utils";

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
  captureBlocked,
  capturePendingKey,
  resultRows,
  onToggleDraft,
  draftChecked = false,
  draftError,
  inputOrder = "asc",
  serverDayOpsStatus,
}: {
  participant: HeatMarshalParticipant | undefined;
  /** ページ SSR の参加者ステータス（マーシャル一覧より新しい CALLED と整合させる） */
  serverDayOpsStatus?: string | undefined;
  heatIndex: number;
  captureBlocked: boolean;
  capturePendingKey: string | null;
  resultRows: Array<{
    heat: number | null;
    rank: number | null;
    advanceWithoutRank?: boolean;
    entryType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
  }>;
  onToggleDraft: (payload: {
    opKey: string;
    heatIndex: number;
    participant: HeatMarshalParticipant;
    inputOrder: "asc" | "desc";
    checked: boolean;
  }) => void;
  draftChecked?: boolean;
  draftError?: string;
  inputOrder?: "asc" | "desc";
}) {
  if (!participant) {
    return <span className="inline-block w-4 shrink-0" aria-hidden />;
  }

  const p = participant;
  const pKey = marshalParticipantKey(p);
  const rank = rankForParticipant(heatIndex, p, resultRows);
  const hasRunUp = resultRows.some((r) => {
    if (!r.advanceWithoutRank || r.heat !== heatIndex) return false;
    if (p.participantType === "INDIVIDUAL") {
      return r.entryType === "INDIVIDUAL" && r.competitionEntryId === p.competitionEntryId;
    }
    return r.entryType === "TEAM" && r.teamEntryId === p.teamEntryId;
  });
  const hasRank = rank != null;
  const checkedState = hasRank || draftChecked;
  const mergedStatus = resolveHeatLaneDayOpsDisplayStatus(p, serverDayOpsStatus);
  const isTerminal = Boolean(mergedStatus && isDayOpsTerminalParticipantStatus(mergedStatus));
  /** マーシャル GET の行のみで判定（ポールの CALLED だけでは有効にしない） */
  const marshalReady = isCalledLikeStatus(p.status);
  const teamMissingMember =
    p.participantType === "TEAM" && !(p.teamMemberUserId && p.teamMemberUserId.trim());
  const globallyBusy = capturePendingKey !== null;
  const rowBusy = capturePendingKey === pKey;
  const checkboxDisabled =
    captureBlocked ||
    globallyBusy ||
    isTerminal ||
    hasRank ||
    hasRunUp ||
    !marshalReady ||
    teamMissingMember;
  const inputId = `sl-result-h${heatIndex}-L${p.lane}-${pKey.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxSize = "size-3.5";

  const marshalBlockTitle =
    isMarshalAbsentDisplayStatus(mergedStatus)
      ? "マーシャル締切により未出場扱いのためリザルトを記録できません（競技中の失格 DSQ とは別）"
      : teamMissingMember
        ? "チーム構成員が割り当てられていないため、このレーンではリザルトを記録できません"
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
        checked={checkedState}
        disabled={checkboxDisabled}
        className={cn(
          "col-start-1 row-start-1",
          boxSize,
          "rounded-[5px] [&_svg]:size-2.5",
          hasRank &&
            "border-violet-600 data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600",
          rowBusy && "invisible",
          draftError && "border-destructive"
        )}
        onCheckedChange={(checked) => {
          if (hasRank) return;
          onToggleDraft({
            opKey: pKey,
            heatIndex,
            participant: p,
            inputOrder,
            checked: checked === true,
          });
        }}
      />
      {rowBusy ? (
        <Loader2 className="col-start-1 row-start-1 size-3.5 animate-spin text-primary" aria-hidden />
      ) : null}
    </div>
  );
}
