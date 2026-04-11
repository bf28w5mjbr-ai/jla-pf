/**
 * 大会種目の DB 保存用名称。
 * 年齢カテゴリに属する場合は「種目名（年齢カテゴリ名称＋タブ内種目名）」の形にする。
 * ここでは UI で入力されるタブ内の種目名を「種目名」と「タブ内種目名」の両方に用いる。
 */
export function buildStoredCompetitionEventName(input: {
  tabInnerName: string;
  ageCategoryId: string | null;
  ageCategoryName: string | null | undefined;
}): string {
  const inner = input.tabInnerName.trim();
  if (!inner) return inner;
  const catId = input.ageCategoryId?.trim() ?? "";
  const catName = input.ageCategoryName?.trim() ?? "";
  if (!catId || !catName) {
    return inner;
  }
  return `${inner}（${catName}＋${inner}）`;
}
