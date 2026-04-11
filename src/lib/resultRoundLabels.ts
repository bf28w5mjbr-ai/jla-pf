import { parseStartListSettings } from "@/lib/startListSettings";
import {
  buildMarshalRoundLabelBySnapshotKey,
  getLiveTabsAligned,
} from "@/lib/startListEventTabDisplay";

export type ResultRoundUiKey = "HEAT" | "SEMI" | "FINAL";

const DEFAULT_JA: Record<ResultRoundUiKey, string> = {
  HEAT: "予選",
  SEMI: "準決勝",
  FINAL: "決勝",
};

/**
 * 種目のスタートリスト設定から、スナップショット内部キー（HEAT/SEMI/FINAL）→ タブ表示名の対応を構築する。
 * {@link buildMarshalRoundLabelBySnapshotKey} と同じルール。
 */
export function buildResultRoundLabelMap(
  startListSettings: unknown,
  eventId: string,
  startListRoundCount: number | null | undefined
): Partial<Record<ResultRoundUiKey, string>> {
  const { eventSettings } = parseStartListSettings(startListSettings);
  const heatSetting = eventSettings[eventId] ?? {};
  const rc =
    typeof startListRoundCount === "number" &&
    Number.isInteger(startListRoundCount) &&
    startListRoundCount >= 1 &&
    startListRoundCount <= 32
      ? startListRoundCount
      : null;
  const liveTabs = getLiveTabsAligned(heatSetting, rc);
  const tabCount = Math.max(1, liveTabs.length);
  return buildMarshalRoundLabelBySnapshotKey(liveTabs, tabCount);
}

/**
 * UI 表示用ラウンド名。タブに名前があればそれを使い、空で内部キーだけのときは「予選／準決勝／決勝」に寄せる。
 */
export function displayResultRoundLabel(
  round: ResultRoundUiKey,
  labelsByKey?: Partial<Record<ResultRoundUiKey, string>> | null
): string {
  const raw = labelsByKey?.[round]?.trim();
  if (raw && raw !== "HEAT" && raw !== "SEMI" && raw !== "FINAL") {
    return raw;
  }
  return DEFAULT_JA[round] ?? round;
}

/** 設定が無いときの短い和名（ドロップダウン等でキー値のまま出さない用） */
export function defaultResultRoundLabelJa(round: ResultRoundUiKey): string {
  return DEFAULT_JA[round] ?? round;
}
