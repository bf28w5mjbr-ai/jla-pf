import { ENTRY_REQUIRED_CERTIFIED_LIFESAVER } from "@/lib/competitionEntryAgeTiered";
import { isPlayerRegistrationQualificationKind } from "@/lib/qualificationRegistrationKinds";

/**
 * 管理画面の参加資格チェックを「選手登録系・認定ライフセーバー」と「その他」に分ける。
 * 保存形式や API には影響しない（表示順のみ）。
 */
export function splitQualificationOptionsForAdminUi(options: readonly string[]): {
  primary: string[];
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

  const other = options.filter((o) => !inPrimary.has(o));
  return { primary, other };
}
