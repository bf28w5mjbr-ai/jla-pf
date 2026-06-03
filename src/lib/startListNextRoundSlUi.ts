/** 次ラ SL モードバー表示可否（loading 中または SL 操作可能時のみ true） */
export function shouldShowNextRoundSlSection(
  status: {
    canGenerate: boolean;
    canRegenerate: boolean;
    canRescueRegenerate: boolean;
  } | null,
  loading: boolean
): boolean {
  if (loading) return true;
  if (!status) return false;
  return status.canGenerate || status.canRegenerate || status.canRescueRegenerate;
}
