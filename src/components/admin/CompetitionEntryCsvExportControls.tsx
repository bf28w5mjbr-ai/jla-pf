"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompetitionEntriesSpreadsheetExportButton } from "@/components/admin/CompetitionEntriesSpreadsheetExportButton";
import { CSV_EXPORT_SCOPE } from "@/lib/competitionEntryCsvExport";

type Props = {
  competitionId: string;
  scope: typeof CSV_EXPORT_SCOPE.INDIVIDUAL | typeof CSV_EXPORT_SCOPE.TEAM;
  csvHeaders: readonly string[];
  csvRows: readonly (readonly string[])[];
  fileNameBase: string;
  hasPending: boolean;
  hasActiveApproval: boolean;
};

export default function CompetitionEntryCsvExportControls({
  competitionId,
  scope,
  csvHeaders,
  csvRows,
  fileNameBase,
  hasPending,
  hasActiveApproval,
}: Props) {
  const [loading, setLoading] = useState(false);

  const request = async () => {
    if (csvRows.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/entry-csv-export-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "依頼に失敗しました");
      }
      toast.success("PF管理者へ承認依頼を送信しました");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "依頼に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (hasActiveApproval) {
    return (
      <CompetitionEntriesSpreadsheetExportButton
        csvHeaders={csvHeaders}
        csvRows={csvRows}
        fileNameBase={fileNameBase}
        label="CSVダウンロード"
      />
    );
  }

  if (hasPending) {
    return (
      <div className="flex max-w-md flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <Badge variant="secondary" className="w-fit shrink-0">
          承認待ち
        </Badge>
        <p className="text-xs leading-snug text-muted-foreground">
          PF管理者の承認後、ここからCSVをダウンロードできます。
        </p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => void request()}
      disabled={loading || csvRows.length === 0}
    >
      <Send className="h-4 w-4 shrink-0" aria-hidden />
      {loading ? "送信中…" : "CSV出力を依頼"}
    </Button>
  );
}
