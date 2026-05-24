export const START_LIST_UNCATEGORIZED_KEY = "__UNCATEGORIZED__";

export type StartListAgeCategoryScopedEvent = {
  id: string;
  ageCategoryId?: string | null;
  ageCategoryName?: string | null;
  ageCategoryDisplayOrder?: number | null;
};

export type StartListAgeCategoryTabItem = {
  key: string;
  label: string;
  count: number;
};

type AgeCategoryTabAccum = StartListAgeCategoryTabItem & {
  displayOrder: number | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function ageCategoryScopeKey(ageCategoryId?: string | null): string {
  const normalized = normalizeText(ageCategoryId);
  return normalized.length > 0 ? normalized : START_LIST_UNCATEGORIZED_KEY;
}

function compareAgeCategoryTabs(a: AgeCategoryTabAccum, b: AgeCategoryTabAccum): number {
  if (a.key === START_LIST_UNCATEGORIZED_KEY) return 1;
  if (b.key === START_LIST_UNCATEGORIZED_KEY) return -1;
  const oa = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const ob = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.label.localeCompare(b.label, "ja", { numeric: true, sensitivity: "base" });
}

export function buildStartListAgeCategoryTabs<T extends StartListAgeCategoryScopedEvent>(
  events: readonly T[]
): StartListAgeCategoryTabItem[] {
  const byKey = new Map<string, AgeCategoryTabAccum>();
  for (const event of events) {
    const key = ageCategoryScopeKey(event.ageCategoryId);
    const label =
      key === START_LIST_UNCATEGORIZED_KEY
        ? "未分類"
        : normalizeText(event.ageCategoryName) || "カテゴリ";
    const displayOrder =
      key === START_LIST_UNCATEGORIZED_KEY
        ? null
        : typeof event.ageCategoryDisplayOrder === "number" &&
            Number.isFinite(event.ageCategoryDisplayOrder)
          ? event.ageCategoryDisplayOrder
          : null;
    const current = byKey.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    byKey.set(key, { key, label, count: 1, displayOrder });
  }
  return Array.from(byKey.values())
    .sort(compareAgeCategoryTabs)
    .map(({ key, label, count }) => ({ key, label, count }));
}

export function filterEventsByStartListAgeCategory<T extends StartListAgeCategoryScopedEvent>(
  events: readonly T[],
  categoryKey: string
): T[] {
  const key = normalizeText(categoryKey);
  if (!key) return [...events];
  return events.filter((event) => ageCategoryScopeKey(event.ageCategoryId) === key);
}

export function mergeReorderedEventsByIds<T extends { id: string }>(
  allEvents: readonly T[],
  visibleReorderedIds: readonly string[]
): T[] {
  const idToEvent = new Map(allEvents.map((event) => [event.id, event]));
  const visibleSet = new Set(visibleReorderedIds);
  const reorderedVisible = visibleReorderedIds
    .map((id) => idToEvent.get(id))
    .filter((event): event is T => Boolean(event));

  const next: T[] = [];
  let cursor = 0;
  for (const event of allEvents) {
    if (visibleSet.has(event.id)) {
      const replacement = reorderedVisible[cursor];
      if (replacement) next.push(replacement);
      cursor += 1;
      continue;
    }
    next.push(event);
  }
  return next;
}
