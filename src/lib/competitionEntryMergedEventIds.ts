/**
 * エントリー受付時点の種目（スナップショット優先）をマージした集合。
 * スタートリスト・CSV 整合には {@link getLiveIndividualEventIdsFromEntry} を使うこと。
 */
export function getMergedEventIdsFromEntry(entry: {
  items: { eventId: string }[];
  snapshot: { data: unknown } | null | undefined;
}): Set<string> {
  const snapshot = entry.snapshot?.data as
    | {
        items?: { eventId?: string }[];
        teamEntries?: { eventId?: string }[];
      }
    | undefined;
  const individualItems = Array.isArray(snapshot?.items)
    ? snapshot.items
    : entry.items.map((item) => ({ eventId: item.eventId }));
  const teamItems = Array.isArray(snapshot?.teamEntries) ? snapshot.teamEntries : [];
  const ids = [
    ...individualItems.map((item) => item.eventId),
    ...teamItems.map((item) => item.eventId),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  return new Set(ids);
}
