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

const FULLWIDTH_PLUS = "＋";

/**
 * DB の種目名からタブ内の種目名（buildStoredCompetitionEventName に渡す inner）を得る。
 * 既に canonical（inner（カテゴリ名＋inner））なら inner を返す。それ以外は trim した全体を inner とみなす。
 */
export function extractTabInnerCompetitionEventName(
  storedName: string,
  ageCategoryName: string | null | undefined
): string {
  const name = storedName.trim();
  const cat = (ageCategoryName ?? "").trim();
  if (!cat) return name;
  const marker = `（${cat}${FULLWIDTH_PLUS}`;
  const i = name.indexOf(marker);
  if (i <= 0) return name;
  const prefix = name.slice(0, i);
  const after = name.slice(i + marker.length);
  if (!after.endsWith("）")) return name;
  const middle = after.slice(0, -1);
  if (middle === prefix) return prefix;
  return name;
}
