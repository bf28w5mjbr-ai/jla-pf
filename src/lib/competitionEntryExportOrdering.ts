/**
 * エントリーCSV・「出場種目」表示で、種目を大会マスタの順に揃える。
 * 並び: 年齢カテゴリの displayOrder（同値は name の日本語・数値順）→ 種目の displayOrder → 性別 → id
 */

export function sortEventsByDisplayOrder<T extends { id: string; displayOrder: number }>(
  events: readonly T[]
): T[] {
  return [...events].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.id.localeCompare(b.id);
  });
}

function sexSortKey(sex: string): number {
  if (sex === "MALE") return 0;
  if (sex === "FEMALE") return 1;
  return 2;
}

/**
 * 年齢カテゴリ（`displayOrder`、同値は `name` の日本語・数値順）→ 種目 `displayOrder` → 性別 → `id` の順で全種目を並べる。
 * `ageCategoryId` がマスタに無い種目は「未紐づけカテゴリ」の直前、
 * `ageCategoryId` が null の種目は最後（同一グループ内は displayOrder）。
 */
export function sortEventsForEntryExport<
  T extends {
    id: string;
    displayOrder: number;
    ageCategoryId: string | null;
    sex: string;
  },
>(
  events: readonly T[],
  ageCategories: readonly { id: string; displayOrder: number; name?: string | null }[]
): T[] {
  const catsSorted = [...ageCategories].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const na = (a.name ?? "").trim();
    const nb = (b.name ?? "").trim();
    if (na !== nb) return na.localeCompare(nb, "ja", { numeric: true });
    return a.id.localeCompare(b.id);
  });
  const categoryRank = new Map<string, number>();
  catsSorted.forEach((c, i) => {
    categoryRank.set(c.id, i);
  });
  const staleRank = catsSorted.length;
  const noneRank = catsSorted.length + 1;

  const rankOf = (e: T): number => {
    if (!e.ageCategoryId) return noneRank;
    if (categoryRank.has(e.ageCategoryId)) return categoryRank.get(e.ageCategoryId)!;
    return staleRank;
  };

  return [...events].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const sa = sexSortKey(a.sex);
    const sb = sexSortKey(b.sex);
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * `programOrder` は大会の全種目を表示順に並べた配列。
 * `mergedIds` に含まれる種目だけ、同じ順でラベル文字列を返す。マスタに無い ID は末尾に辞書順。
 */
export function orderedLabelsForMergedEventIds<T extends { id: string }>(
  programOrder: readonly T[],
  mergedIds: ReadonlySet<string>,
  formatLabel: (eventId: string) => string
): string[] {
  const labels: string[] = [];
  const remaining = new Set(mergedIds);
  for (const ev of programOrder) {
    if (remaining.has(ev.id)) {
      labels.push(formatLabel(ev.id));
      remaining.delete(ev.id);
    }
  }
  for (const id of [...remaining].sort((a, b) => a.localeCompare(b))) {
    labels.push(formatLabel(id));
  }
  return labels;
}
