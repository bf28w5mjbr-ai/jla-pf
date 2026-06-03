import type { ResultDraftOp } from "@/hooks/liveRound/types";

export function countTieSessionDraftsForHeat(
  drafts: Record<string, ResultDraftOp>,
  heatIndex: number,
  tieSessionEpoch: number
): number {
  let n = 0;
  for (const op of Object.values(drafts)) {
    if (op.heatIndex === heatIndex && op.createdInTieSessionEpoch === tieSessionEpoch) {
      n += 1;
    }
  }
  return n;
}

/** 同着モード中の draft 追加時に `tieWithPrevious` を決める */
export function resolveTieWithPreviousForDraft(params: {
  tieModeOn: boolean;
  checked: boolean;
  heatIndex: number;
  drafts: Record<string, ResultDraftOp>;
  tieSessionEpoch: number;
}): { tieWithPrevious: boolean; createdInTieSessionEpoch?: number } {
  const { tieModeOn, checked, heatIndex, drafts, tieSessionEpoch } = params;

  if (!tieModeOn || !checked) {
    return { tieWithPrevious: false };
  }

  const hasSessionDraft =
    countTieSessionDraftsForHeat(drafts, heatIndex, tieSessionEpoch) > 0;

  return {
    tieWithPrevious: hasSessionDraft,
    createdInTieSessionEpoch: tieSessionEpoch,
  };
}

/** NFC append: 同着セッションで既に1件記録済みなら直前と同着 */
export function resolveTieWithPreviousForNfcAppend(params: {
  tieModeOn: boolean;
  heatIndex: number;
  nfcTieSessionStarted: boolean;
}): boolean {
  const { tieModeOn, heatIndex: _heatIndex, nfcTieSessionStarted } = params;
  if (!tieModeOn) return false;
  return nfcTieSessionStarted;
}
