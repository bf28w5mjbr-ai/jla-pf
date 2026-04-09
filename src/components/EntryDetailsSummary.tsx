import { Card } from "@/components/ui/card";

const sexLabel = (sex?: string | null) => {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
};

type EventLike = {
  id: string;
  name: string;
  sex?: string | null;
};

type EntryItem = {
  eventId?: string | null;
  entryTime?: string | null;
};

type TeamEntryItem = {
  eventId?: string | null;
  teamName?: string | null;
};

type EntryDetailsSummaryProps = {
  title?: string;
  individualItems: EntryItem[];
  teamItems: TeamEntryItem[];
  eventMap: Map<string, EventLike>;
  notes?: string | null;
};

export default function EntryDetailsSummary({
  title = "エントリー内容",
  individualItems,
  teamItems,
  eventMap,
  notes,
}: EntryDetailsSummaryProps) {
  const formatEventLabel = (event: EventLike | undefined) => {
    if (!event) return "種目不明";
    return `${event.name}（${sexLabel(event.sex)}）`;
  };

  const hasItems = individualItems.length > 0 || teamItems.length > 0;
  const hasNotes = typeof notes === "string" && notes.trim().length > 0;

  return (
    <Card className="border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</p>
      {!hasItems && !hasNotes ? (
        <p className="mt-2 text-sm text-gray-500">エントリー内容がありません。</p>
      ) : (
        <div className="mt-3 space-y-4">
          {individualItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500">個人種目</p>
              <ul className="mt-2 space-y-2">
                {individualItems.map((item, index) => {
                  const event = item.eventId ? eventMap.get(item.eventId) : undefined;
                  return (
                    <li
                      key={`${item.eventId ?? "unknown"}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-sm">{formatEventLabel(event)}</span>
                      {item.entryTime && (
                        <span className="text-xs text-gray-500">タイム: {item.entryTime}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {teamItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500">チーム種目</p>
              <ul className="mt-2 space-y-2">
                {teamItems.map((item, index) => {
                  const event = item.eventId ? eventMap.get(item.eventId) : undefined;
                  return (
                    <li
                      key={`${item.eventId ?? "team"}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-sm">{formatEventLabel(event)}</span>
                      {item.teamName && (
                        <span className="text-xs text-gray-500">チーム名: {item.teamName}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {hasNotes && (
            <div>
              <p className="text-xs font-semibold text-gray-500">連絡事項</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                {notes}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
