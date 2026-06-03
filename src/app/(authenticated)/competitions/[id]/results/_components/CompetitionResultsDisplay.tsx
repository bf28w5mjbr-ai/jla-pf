import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayResultRoundLabel } from "@/lib/resultRoundLabels";
import type { CompetitionOfficialResultsPayload } from "@/lib/competitionOfficialResultsPayload";

type ResultRow = CompetitionOfficialResultsPayload["results"][number]["rows"][number];

function formatResult(row: ResultRow) {
  if (row.resultText) return row.resultText;
  if (row.status !== "OK") return row.status;
  if (row.resultValue == null) return "-";
  switch (row.unit) {
    case "TIME_MS": {
      const totalSeconds = row.resultValue / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0");
      return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}`;
    }
    case "DISTANCE_CM":
      return `${(row.resultValue / 100).toFixed(2)}m`;
    case "POINTS":
      return `${row.resultValue}pt`;
    default:
      return String(row.resultValue);
  }
}

function statusLabel(status: ResultRow["status"]) {
  switch (status) {
    case "DNS":
      return "DNS";
    case "DNF":
      return "DNF";
    case "DSQ":
      return "DSQ";
    default:
      return "OK";
  }
}

export function CompetitionResultsDisplay({
  results,
  roundLabelsByEventId,
}: CompetitionOfficialResultsPayload) {
  const grouped = (() => {
    const map = new Map<string, typeof results>();
    for (const result of results) {
      const key = `${result.eventId}`;
      const list = map.get(key) ?? [];
      list.push(result);
      map.set(key, list);
    }
    return Array.from(map.values());
  })();

  if (grouped.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            表示できる結果はまだありません（ヒート確定またはラウンド確定後に表示されます）
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-10">
      {grouped.map((eventResults) => {
        const eventName = eventResults[0]?.event?.name ?? "種目";
        return (
          <Card key={eventResults[0].eventId}>
            <CardHeader>
              <CardTitle>{eventName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {eventResults.map((result) => (
                <div key={result.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      ラウンド:{" "}
                      {displayResultRoundLabel(result.round, roundLabelsByEventId[result.eventId])}
                    </span>
                    {result.lockedAt && (
                      <span>確定: {new Date(result.lockedAt).toLocaleString("ja-JP")}</span>
                    )}
                  </div>
                  {result.note && <p className="text-sm text-muted-foreground">{result.note}</p>}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4">順位</th>
                          <th className="py-2 pr-4">ステータス</th>
                          <th className="py-2 pr-4">結果</th>
                          <th className="py-2 pr-4">レーン</th>
                          <th className="py-2 pr-4">ヒート</th>
                          <th className="py-2 pr-4">備考</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row) => (
                          <tr key={row.id} className="border-b last:border-b-0">
                            <td className="py-2 pr-4">{row.rank ?? "-"}</td>
                            <td className="py-2 pr-4">{statusLabel(row.status)}</td>
                            <td className="py-2 pr-4 font-semibold">{formatResult(row)}</td>
                            <td className="py-2 pr-4">{row.lane ?? "-"}</td>
                            <td className="py-2 pr-4">{row.heat ?? "-"}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{row.remarks ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
