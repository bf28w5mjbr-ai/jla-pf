import { parseRoundScheduledStarts } from "@/lib/eventRoundScheduledStarts";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";

/** IndexBars の `serverEventsSyncKeyFromSorted` と同一（種目ページのフック同期キー用） */
export function serverEventsSyncKeyFromSorted(sorted: StartListEventBarItem[]) {
  return sorted
    .map(
      (e) =>
        `${e.id}:${e.displayOrder}:${e.scheduleTabId ?? ""}:${e.scheduleTabSortOrder ?? 0}:${e.scheduledStartAt ? new Date(e.scheduledStartAt).getTime() : ""}:${JSON.stringify(parseRoundScheduledStarts(e.roundScheduledStarts))}:${e.startListRoundCount ?? 1}:${e.entryCount ?? 0}:${e.preliminaryHeatLaneCount ?? ""}:${e.startListHeatPlanConfirmedAt ? new Date(e.startListHeatPlanConfirmedAt).getTime() : ""}:${e.marshalStartedAt ? new Date(e.marshalStartedAt).getTime() : ""}`
    )
    .join("|");
}
