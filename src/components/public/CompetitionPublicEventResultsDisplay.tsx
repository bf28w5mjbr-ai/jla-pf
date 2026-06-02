import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayResultRoundLabel } from "@/lib/resultRoundLabels";
import type { CompetitionOfficialResultsPublicPayload } from "@/lib/competitionOfficialResultsPublicPayload";

type ResultRow = CompetitionOfficialResultsPublicPayload["results"][number]["rows"][number];

function formatProfileName(
  profile: { familyName: string | null; givenName: string | null } | null | undefined
) {
  return [profile?.familyName, profile?.givenName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
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
    case "WITHDRAWN":
      return "棄権";
    default:
      return "OK";
  }
}

function participantLabel(row: ResultRow): string {
  if (row.entryType === "INDIVIDUAL" && row.competitionEntry) {
    const name = formatProfileName(row.competitionEntry.user.profile);
    return name || "—";
  }
  if (row.entryType === "TEAM" && row.teamEntry) {
    const teamName = row.teamEntry.teamName?.trim() || "チーム";
    const members = row.teamEntry.members
      .map((m) => formatProfileName(m.user.profile))
      .filter(Boolean);
    if (members.length > 0) {
      return `${teamName}（${members.join("、")}）`;
    }
    return teamName;
  }
  return "—";
}

function clubLabel(row: ResultRow): string {
  if (row.entryType === "INDIVIDUAL") {
    return row.competitionEntry?.club?.name?.trim() || "—";
  }
  if (row.entryType === "TEAM") {
    return row.teamEntry?.club?.name?.trim() || "—";
  }
  return "—";
}

type Props = CompetitionOfficialResultsPublicPayload;

export function CompetitionPublicEventResultsDisplay({
  results,
  roundLabelsByEventId,
  highlightRound,
}: Props) {
  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {highlightRound
            ? "このラウンドの公開済み結果はまだありません"
            : "公開済みの公式結果はまだありません"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result) => (
        <Card
          key={result.id}
          className={
            highlightRound && result.round === highlightRound
              ? "border-primary/30 ring-1 ring-primary/10"
              : undefined
          }
        >
          <CardHeader className="border-b border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold">
              {displayResultRoundLabel(result.round, roundLabelsByEventId[result.eventId])}
            </CardTitle>
            {result.publishedAt ? (
              <p className="text-xs text-muted-foreground">
                公開: {new Date(result.publishedAt).toLocaleString("ja-JP")}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-left">
                    <th className="py-2.5 pl-4 pr-3 font-medium">順位</th>
                    <th className="py-2.5 pr-3 font-medium">選手・チーム</th>
                    <th className="py-2.5 pr-3 font-medium">クラブ</th>
                    <th className="py-2.5 pr-3 font-medium">結果</th>
                    <th className="py-2.5 pr-3 font-medium">状態</th>
                    <th className="py-2.5 pr-3 font-medium">ヒート</th>
                    <th className="py-2.5 pr-4 font-medium">レーン</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-2.5 pl-4 pr-3 tabular-nums">{row.rank ?? "—"}</td>
                      <td className="py-2.5 pr-3 font-medium">{participantLabel(row)}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{clubLabel(row)}</td>
                      <td className="py-2.5 pr-3 font-semibold tabular-nums">{formatResult(row)}</td>
                      <td className="py-2.5 pr-3">{statusLabel(row.status)}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{row.heat ?? "—"}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{row.lane ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.note ? (
              <p className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
                {result.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
