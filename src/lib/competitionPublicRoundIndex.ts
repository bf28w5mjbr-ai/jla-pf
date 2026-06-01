import type { ResultRound } from "@prisma/client";
import { snapshotRoundForTab } from "@/lib/startListEventTabDisplay";

/** タイムテーブル行の roundIndex を公式結果の ResultRound に対応づける */
export function mapRoundIndexToOfficialResultRound(
  roundIndex: number,
  startListRoundCount: number | null | undefined
): ResultRound | null {
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null;
  const tabCount =
    typeof startListRoundCount === "number" &&
    Number.isInteger(startListRoundCount) &&
    startListRoundCount >= 1
      ? startListRoundCount
      : 1;
  return snapshotRoundForTab(roundIndex, tabCount);
}
