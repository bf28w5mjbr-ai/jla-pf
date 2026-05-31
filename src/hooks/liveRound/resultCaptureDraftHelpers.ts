import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { participantKeyFromResultRow } from "@/components/startListRoundList/panelHelpers";
import type { ResultDraftOp } from "@/hooks/liveRound/types";
import { parseServerResultDraftPayload } from "@/lib/dayOpsHeatOperationDraftSync";

/** マーシャル締切済みヒートの安定キー（pull 再実行トリガー用） */
export function resultDraftHeatsSyncKeyFromHeats(heats: HeatMarshalHeatRow[] | null | undefined): string {
  return (heats ?? [])
    .filter((h) => h.callClosedAt)
    .map((h) => h.heatIndex)
    .sort((a, b) => a - b)
    .join(",");
}

/** bulk / 単体 GET の 1 ヒート分から resultDraftOps 用エントリを組み立てる */
export function resultDraftOpsForHeatFromServerRow(
  heatIndex: number,
  row: { resultDraftPayload: unknown; updatedAt: string | null },
  opts: { lastLocalTouchMs: number; hasLocalForHeat: boolean }
): Record<string, ResultDraftOp> | null {
  if (!row.updatedAt) return null;
  const serverUpdatedMs = Date.parse(row.updatedAt);
  if (!Number.isFinite(serverUpdatedMs)) return null;
  if (serverUpdatedMs <= opts.lastLocalTouchMs) return null;
  const entries = parseServerResultDraftPayload(row.resultDraftPayload);
  if (!entries) return null;
  const entryKeys = Object.keys(entries);
  if (entryKeys.length === 0 && opts.hasLocalForHeat) return null;
  const forHeat: Record<string, ResultDraftOp> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v && typeof v === "object" && v.heatIndex === heatIndex) {
      forHeat[k] = v as ResultDraftOp;
    }
  }
  return forHeat;
}

export function countResultDraftsForHeatFromOps(
  ops: Record<string, ResultDraftOp>,
  heatIndex: number
): number {
  return Object.values(ops).filter((op) => op.heatIndex === heatIndex).length;
}

/** 公式行未反映の未確定チェック（append / confirm manualEntries 対象）を draftSequence 昇順で返す */
export function draftsPendingAppendForHeat(
  ops: Record<string, ResultDraftOp>,
  heatIndex: number,
  localRows: HeatResultCaptureRow[]
): ResultDraftOp[] {
  const rankedKeys = new Set(rankedParticipantKeysForHeatFromRows(localRows, heatIndex));
  return Object.values(ops)
    .filter((op) => op.heatIndex === heatIndex && !rankedKeys.has(op.opKey))
    .sort(
      (a, b) =>
        (a.draftSequence ?? 0) - (b.draftSequence ?? 0) || a.opKey.localeCompare(b.opKey)
    );
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
