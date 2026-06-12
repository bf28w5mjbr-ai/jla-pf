import { parseCompetitionScheduleDatetimeInput } from "@/lib/datetimeLocal";
import { effectiveRoundStartIso, roundStartKey } from "@/lib/eventRoundScheduledStarts";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import type { ScheduleRoundRow } from "@/lib/competitionScheduleTabDisplay";

/** 男子→女子→その他（同一種目名の行順を固定） */
function sexSortKey(sex: string): number {
  if (sex === "MALE") return 0;
  if (sex === "FEMALE") return 1;
  return 2;
}

/**
 * displayOrder 主軸のまま、同順位・同名の男女行の順序を固定し、種目名は日本語の数値順に揃える。
 */
export function compareStartListEvents(a: StartListEventBarItem, b: StartListEventBarItem): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  const nc = a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" });
  if (nc !== 0) return nc;
  const sx = sexSortKey(a.sex) - sexSortKey(b.sex);
  if (sx !== 0) return sx;
  return a.id.localeCompare(b.id);
}

/** 同一エリア（スケジュールタブ）内の並び: DB の scheduleTabSortOrder を優先 */
export function sortEventsWithinScheduleTab(
  events: readonly StartListEventBarItem[]
): StartListEventBarItem[] {
  return [...events].sort((a, b) => {
    const oa = a.scheduleTabSortOrder ?? 0;
    const ob = b.scheduleTabSortOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return compareStartListEvents(a, b);
  });
}

export function effectiveStartMsForRow(
  event: StartListEventBarItem,
  roundIndex: number,
  roundStartsDraft: Record<string, string>
): number {
  const draft = roundStartsDraft[roundStartKey(event.id, roundIndex)]?.trim();
  if (draft) {
    try {
      const d = parseCompetitionScheduleDatetimeInput(draft);
      return d ? d.getTime() : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }
  const iso = effectiveRoundStartIso({
    scheduledStartAt: event.scheduledStartAt,
    roundScheduledStarts: event.roundScheduledStarts,
    roundIndex,
  });
  if (iso) {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }
  return Number.POSITIVE_INFINITY;
}

/** @deprecated 種目単位。行単位は effectiveStartMsForRow を使用 */
export function effectiveStartMsForSort(
  e: StartListEventBarItem,
  roundStartsDraft: Record<string, string>
): number {
  return effectiveStartMsForRow(e, 0, roundStartsDraft);
}

export function sortRowsByStartTimeOrder<T extends ScheduleRoundRow<StartListEventBarItem>>(
  rows: readonly T[],
  roundStartsDraft: Record<string, string>
): T[] {
  return [...rows].sort((a, b) => {
    const da = effectiveStartMsForRow(a.event, a.roundIndex, roundStartsDraft);
    const db = effectiveStartMsForRow(b.event, b.roundIndex, roundStartsDraft);
    if (da !== db) return da - db;
    return compareStartListEvents(a.event, b.event) || a.roundIndex - b.roundIndex;
  });
}

/** @deprecated 種目単位。行単位は sortRowsByStartTimeOrder を使用 */
export function sortByStartTimeOrder(
  list: StartListEventBarItem[],
  roundStartsDraft: Record<string, string>
): StartListEventBarItem[] {
  return [...list].sort((a, b) => {
    const da = effectiveStartMsForSort(a, roundStartsDraft);
    const db = effectiveStartMsForSort(b, roundStartsDraft);
    if (da !== db) return da - db;
    return compareStartListEvents(a, b);
  });
}
