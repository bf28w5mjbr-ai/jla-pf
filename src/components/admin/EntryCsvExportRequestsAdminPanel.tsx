"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PendingCsvExportRequestRow = {
  id: string;
  scope: string;
  createdAt: string;
  competitionName: string;
  organizationName: string;
  requesterLabel: string;
  requesterEmail: string;
};

type Props = {
  requests: PendingCsvExportRequestRow[];
};

const scopeJa = (scope: string) =>
  scope === "TEAM" ? "チームエントリー" : "個人エントリー";

export default function EntryCsvExportRequestsAdminPanel({ requests }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const patch = async (id: string, action: "approve" | "reject") => {
    setLoadingId(id);
    try {
      const body: { action: "approve" | "reject"; rejectReason?: string } = { action };
      if (action === "reject") {
        const reason = window.prompt("却下理由（任意・空欄可）") ?? "";
        body.rejectReason = reason;
      }
      const res = await fetch(`/api/admin/entry-csv-export-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "更新に失敗しました");
      }
      toast.success(action === "approve" ? "承認しました" : "却下しました");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setLoadingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        承認待ちの依頼はありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[8rem]">依頼日時</TableHead>
            <TableHead className="min-w-[10rem]">大会</TableHead>
            <TableHead className="min-w-[8rem]">主催団体</TableHead>
            <TableHead className="whitespace-nowrap">種別</TableHead>
            <TableHead className="min-w-[10rem]">依頼者</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="align-top text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("ja-JP")}
              </TableCell>
              <TableCell className="align-top text-sm font-medium">{r.competitionName}</TableCell>
              <TableCell className="align-top text-sm">{r.organizationName}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline" className="font-normal">
                  {scopeJa(r.scope)}
                </Badge>
              </TableCell>
              <TableCell className="align-top text-sm">
                <div>{r.requesterLabel}</div>
                <div className="font-mono text-xs text-muted-foreground">{r.requesterEmail}</div>
              </TableCell>
              <TableCell className="align-top text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1"
                    disabled={loadingId === r.id}
                    onClick={() => void patch(r.id, "approve")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    承認
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={loadingId === r.id}
                    onClick={() => void patch(r.id, "reject")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    却下
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
