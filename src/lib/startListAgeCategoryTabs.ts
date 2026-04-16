export const START_LIST_UNCATEGORIZED_KEY = "__UNCATEGORIZED__";

export type StartListAgeCategoryScopedEvent = {
  id: string;
  ageCategoryId?: string | null;
  ageCategoryName?: string | null;
};

export type StartListAgeCategoryTabItem = {
  key: string;
  label: string;
  count: number;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function ageCategoryScopeKey(ageCategoryId?: string | null): string {
  const normalized = normalizeText(ageCategoryId);
  return normalized.length > 0 ? normalized : START_LIST_UNCATEGORIZED_KEY;
}

export function buildStartListAgeCategoryTabs<T extends StartListAgeCategoryScopedEvent>(
  events: readonly T[]
): StartListAgeCategoryTabItem[] {
  const byKey = new Map<string, StartListAgeCategoryTabItem>();
  for (const event of events) {
    const key = ageCategoryScopeKey(event.ageCategoryId);
    const label =
      key === START_LIST_UNCATEGORIZED_KEY
        ? "未分類"
        : normalizeText(event.ageCategoryName) || "カテゴリ";
    const current = byKey.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    byKey.set(key, { key, label, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.key === START_LIST_UNCATEGORIZED_KEY) return 1;
    if (b.key === START_LIST_UNCATEGORIZED_KEY) return -1;
    return a.label.localeCompare(b.label, "ja");
  });
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
