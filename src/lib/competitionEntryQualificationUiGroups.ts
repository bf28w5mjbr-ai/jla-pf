import { ENTRY_REQUIRED_CERTIFIED_LIFESAVER } from "@/lib/competitionEntryAgeTiered";
import { isPlayerRegistrationQualificationKind } from "@/lib/qualificationRegistrationKinds";
import { normalizeQualificationKind } from "@/lib/qualificationTemplateRules";

/**
 * 管理画面で「BLS / WaterSafety / 審判（RefereeC〜S）」として独立配置する種別。
 * primary（選手登録・認定ライフセーバー）の直下、その他の資格の上に並べる。
 */
const FOUNDATION_OR_REFEREE_KINDS = [
  "BLS",
  "WaterSafety",
  "ウォーターセーフティ",
  "RefereeC",
  "RefereeB",
  "RefereeA",
  "RefereeS",
  "審判C",
  "審判B",
  "審判A",
  "審判S",
];

const FOUNDATION_OR_REFEREE_NORMALIZED = new Set(
  FOUNDATION_OR_REFEREE_KINDS.map((item) => normalizeQualificationKind(item)).filter(
    (item) => item.length > 0
  )
);

export function isFoundationOrRefereeOptionForAdminUi(value: string | null | undefined): boolean {
  const normalized = normalizeQualificationKind(value);
  if (!normalized) return false;
  return FOUNDATION_OR_REFEREE_NORMALIZED.has(normalized);
}

/**
 * 管理画面の参加資格チェックを 3 区分に分ける。
 * - primary: 選手登録系・認定ライフセーバー
 * - foundation: BLS / WaterSafety / 審判（RefereeC〜S）
 * - other: 上記以外
 * 保存形式や API には影響しない（表示順のみ）。
 */
export function splitQualificationOptionsForAdminUi(options: readonly string[]): {
  primary: string[];
  foundation: string[];
  other: string[];
} {
  const inPrimary = new Set<string>();
  const primary: string[] = [];

  for (const o of options) {
    if (isPlayerRegistrationQualificationKind(o) && !inPrimary.has(o)) {
      inPrimary.add(o);
      primary.push(o);
    }
  }

  if (options.includes(ENTRY_REQUIRED_CERTIFIED_LIFESAVER) && !inPrimary.has(ENTRY_REQUIRED_CERTIFIED_LIFESAVER)) {
    inPrimary.add(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
    primary.push(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
  }

  const foundation: string[] = [];
  const inFoundation = new Set<string>();
  for (const o of options) {
    if (inPrimary.has(o)) continue;
    if (!isFoundationOrRefereeOptionForAdminUi(o)) continue;
    if (inFoundation.has(o)) continue;
    inFoundation.add(o);
    foundation.push(o);
  }

  const other = options.filter((o) => !inPrimary.has(o) && !inFoundation.has(o));
  return { primary, foundation, other };
}
