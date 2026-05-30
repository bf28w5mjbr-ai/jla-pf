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

/** サーバー着順があればそれを、なければ未確定チェック（draftSequence）順 */
export function rankOrderKeysForHeat(
  rows: HeatResultCaptureRow[],
  heatIndex: number,
  draftOps: Record<string, ResultDraftOp>
): string[] {
  const server = rankedParticipantKeysForHeatFromRows(rows, heatIndex);
  if (server.length > 0) return server;
  return Object.entries(draftOps)
    .filter(([, op]) => op.heatIndex === heatIndex)
    .sort(
      (a, b) =>
        (a[1].draftSequence ?? 0) - (b[1].draftSequence ?? 0) ||
        a[0].localeCompare(b[0])
    )
    .map(([key]) => key);
}
