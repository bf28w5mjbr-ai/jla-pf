"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { displayResultRoundLabel, type ResultRoundUiKey } from "@/lib/resultRoundLabels";

interface ResultRow {
  id: string;
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string | null;
  teamEntryId?: string | null;
  rank?: number | null;
  status: "OK" | "DNS" | "DNF" | "DSQ";
  resultValue?: number | null;
  unit: "TIME_MS" | "DISTANCE_CM" | "POINTS" | "OTHER";
  resultText?: string | null;
  penaltyValue?: number | null;
  remarks?: string | null;
  lane?: number | null;
  heat?: number | null;
}

interface OfficialResult {
  id: string;
  eventId: string;
  round: "FINAL" | "HEAT" | "SEMI";
  publishedAt?: string | null;
  lockedAt?: string | null;
  note?: string | null;
  event: { id: string; name: string };
  rows: ResultRow[];
}

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

export default function CompetitionResultsPage() {
  const params = useParams<{ id: string }>();
  const competitionId = params?.id;
  const [results, setResults] = useState<OfficialResult[]>([]);
  const [roundLabelsByEventId, setRoundLabelsByEventId] = useState<
    Record<string, Partial<Record<ResultRoundUiKey, string>>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/competitions/${competitionId}/results`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "結果の取得に失敗しました");
        }
        const data = (await res.json()) as {
          results?: OfficialResult[];
          roundLabelsByEventId?: Record<string, Partial<Record<ResultRoundUiKey, string>>>;
        };
        setResults(data.results ?? []);
        setRoundLabelsByEventId(
          data.roundLabelsByEventId && typeof data.roundLabelsByEventId === "object"
            ? data.roundLabelsByEventId
            : {}
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "結果の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    if (competitionId) {
      load();
    }
  }, [competitionId]);

  const grouped = useMemo(() => {
    const map = new Map<string, OfficialResult[]>();
    for (const result of results) {
      const key = `${result.eventId}`;
      const list = map.get(key) ?? [];
      list.push(result);
      map.set(key, list);
    }
    return Array.from(map.values());
  }, [results]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <Card>
          <CardContent className="py-10 text-center">読み込み中...</CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            公開済みの公式結果はまだありません
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-10 space-y-6">
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
                    {result.publishedAt && (
                      <span>公開: {new Date(result.publishedAt).toLocaleString("ja-JP")}</span>
                    )}
                    {result.lockedAt && (
                      <span>確定: {new Date(result.lockedAt).toLocaleString("ja-JP")}</span>
                    )}
                  </div>
                  {result.note && (
                    <p className="text-sm text-muted-foreground">{result.note}</p>
                  )}
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
                            <td className="py-2 pr-4 text-muted-foreground">
                              {row.remarks ?? "-"}
                            </td>
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
