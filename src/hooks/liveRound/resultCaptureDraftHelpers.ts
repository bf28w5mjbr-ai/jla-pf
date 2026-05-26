import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { participantKeyFromResultRow } from "@/components/startListRoundList/panelHelpers";
import type { ResultDraftOp } from "@/hooks/liveRound/types";

export function countResultDraftsForHeatFromOps(
  ops: Record<string, ResultDraftOp>,
  heatIndex: number
): number {
  return Object.values(ops).filter((op) => op.heatIndex === heatIndex).length;
}

export function rankedParticipantKeysForHeatFromRows(
  rows: HeatResultCaptureRow[],
  heatIndex: number
): string[] {
  return [...rows]
    .filter((row) => row.heat === heatIndex && row.rank != null)
    .map((row) => ({
      key: participantKeyFromResultRow(row),
      rank: row.rank as number,
    }))
    .filter((x): x is { key: string; rank: number } => Boolean(x.key))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.key);
}
