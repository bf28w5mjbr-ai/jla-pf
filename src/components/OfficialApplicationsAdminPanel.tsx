"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type OfficialApplicationAdminRow = {
  id: string;
  positionName: string;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: { familyName: string; givenName: string; email: string };
};

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  applications: OfficialApplicationAdminRow[];
};

function statusLabel(s: OfficialApplicationAdminRow["status"]) {
  switch (s) {
    case "PENDING":
      return "審査中";
    case "APPROVED":
      return "承認";
    case "REJECTED":
      return "却下";
    default:
      return s;
  }
}

function statusClass(s: OfficialApplicationAdminRow["status"]) {
  switch (s) {
    case "PENDING":
      return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "REJECTED":
      return "bg-muted text-muted-foreground";
    default:
      return "";
  }
}

export function OfficialApplicationsAdminPanel({
  organizationId,
  competitionId,
  canEdit,
  applications,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const patchStatus = (applicationId: string, status: "APPROVED" | "REJECTED") => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-applications/${applicationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "更新に失敗しました");
        }
        toast.success(status === "APPROVED" ? "承認しました" : "却下しました");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  };

  if (applications.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/15 px-3 py-5 text-center text-xs text-muted-foreground">
        応募はまだありません（大会ページからログインユーザーが応募できます）。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="h-8 border-b bg-muted/30 hover:bg-muted/30">
            <TableHead className="h-8 whitespace-nowrap px-2 py-1.5 text-[11px] font-semibold">
              日時
            </TableHead>
            <TableHead className="h-8 px-2 py-1.5 text-[11px] font-semibold">氏名</TableHead>
            <TableHead className="hidden h-8 px-2 py-1.5 text-[11px] font-semibold sm:table-cell">
              メール
            </TableHead>
            <TableHead className="h-8 px-2 py-1.5 text-[11px] font-semibold">ポジション</TableHead>
            <TableHead className="hidden h-8 max-w-[160px] px-2 py-1.5 text-[11px] font-semibold md:table-cell">
              メッセージ
            </TableHead>
            <TableHead className="h-8 px-2 py-1.5 text-[11px] font-semibold">状態</TableHead>
            {canEdit ? (
              <TableHead className="h-8 px-2 py-1.5 text-right text-[11px] font-semibold">
                操作
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((a) => (
            <TableRow key={a.id} className="h-auto border-b last:border-0">
              <TableCell className="whitespace-nowrap px-2 py-1.5 text-[11px] tabular-nums text-muted-foreground">
                {new Date(a.createdAt).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-xs font-medium">
                {a.user.familyName} {a.user.givenName}
              </TableCell>
              <TableCell className="hidden max-w-[140px] truncate px-2 py-1.5 text-[11px] text-muted-foreground sm:table-cell">
                {a.user.email}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-xs">{a.positionName}</TableCell>
              <TableCell className="hidden max-w-[160px] truncate px-2 py-1.5 text-[11px] text-muted-foreground md:table-cell">
                {a.message?.trim() || "—"}
              </TableCell>
              <TableCell className="px-2 py-1.5">
                <span
                  className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusClass(a.status)}`}
                >
                  {statusLabel(a.status)}
                </span>
              </TableCell>
              {canEdit ? (
                <TableCell className="px-2 py-1.5 text-right">
                  {a.status === "PENDING" ? (
                    <div className="flex flex-wrap justify-end gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={isPending}
                        onClick={() => patchStatus(a.id, "APPROVED")}
                      >
                        承認
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={isPending}
                        onClick={() => patchStatus(a.id, "REJECTED")}
                      >
                        却下
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
