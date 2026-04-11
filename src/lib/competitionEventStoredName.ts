/**
 * 大会種目の DB 保存用名称。
 * 年齢カテゴリに属する場合は「年齢カテゴリ名称」と「タブ内種目名」をそのまま連結した1本の文字列にする。
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
  return `${catName}${inner}`;
}

const FULLWIDTH_PLUS = "＋";

/**
 * DB の種目名からタブ内の種目名（buildStoredCompetitionEventName に渡す inner）を得る。
 * - 旧形式: inner（カテゴリ名＋inner）なら inner
 * - 新形式: カテゴリ名が先頭に付いた連結なら、その直後を inner
 * - 上記以外は trim した全体を inner とみなす
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
  if (i > 0) {
    const prefix = name.slice(0, i);
    const after = name.slice(i + marker.length);
    if (after.endsWith("）")) {
      const middle = after.slice(0, -1);
      if (middle === prefix) return prefix;
    }
  }

  if (name.startsWith(cat) && name.length > cat.length) {
    return name.slice(cat.length);
  }

  return name;
}
