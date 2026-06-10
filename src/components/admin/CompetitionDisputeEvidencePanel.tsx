"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DISPUTE_FILE_EVIDENCE_KEYS,
  type DisputeFileEvidenceKey,
} from "@/lib/stripeDisputeEvidenceKeys";

export type DisputeEvidenceRow = {
  disputeId: string;
  scopeLabel: string;
  amountYen: number;
  dueByLabel: string | null;
  stripeStatus: string;
};

const EVIDENCE_LABELS: Record<DisputeFileEvidenceKey, string> = {
  uncategorized_file: "その他の資料（汎用）",
  customer_communication: "顧客とのやり取り（メール等）",
  receipt: "領収書・請求通知",
  service_documentation: "サービス提供の証明（契約書・参加記録等）",
};

export default function CompetitionDisputeEvidencePanel({
  organizationId,
  competitionId,
  rows,
  embedded = false,
}: {
  organizationId: string;
  competitionId: string;
  rows: DisputeEvidenceRow[];
  /** details 内に埋め込むとき見出しを省略 */
  embedded?: boolean;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const submitEvidence = async (
    disputeId: string,
    form: HTMLFormElement,
    submit: boolean
  ) => {
    const fd = new FormData(form);
    fd.set("submit", submit ? "true" : "false");
    setLoadingId(disputeId);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/stripe-disputes/${encodeURIComponent(disputeId)}/evidence`,
        { method: "POST", body: fd, credentials: "include" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        disputeStatus?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "送信に失敗しました");
        return;
      }
      toast.success(submit ? "証拠を提出しました" : "証拠ファイルを Stripe に登録しました", {
        description: data.disputeStatus ? `Stripe 上の状態: ${data.disputeStatus}` : undefined,
      });
      form.reset();
    } catch (e) {
      console.error(e);
      toast.error("送信に失敗しました");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <section
      aria-labelledby={embedded ? undefined : "dispute-evidence-heading"}
      className={
        embedded
          ? "space-y-3"
          : "rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/25"
      }
    >
      {embedded ? null : (
        <h3
          id="dispute-evidence-heading"
          className="text-xs font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100"
        >
          カード決済の紛争（チャージバック）
        </h3>
      )}
      <p className={`text-[11px] leading-relaxed text-amber-950/90 dark:text-amber-50/90 ${embedded ? "" : "mt-1"}`}>
        Stripe のプラットフォーム決済に付いた紛争です。証拠ファイルは Stripe の{" "}
        <code className="rounded bg-amber-100/80 px-0.5 text-[10px] dark:bg-amber-900/60">dispute_evidence</code>{" "}
        としてアップロードされ、<code className="rounded bg-amber-100/80 px-0.5 text-[10px] dark:bg-amber-900/60">disputes.update</code>{" "}
        に反映されます。「銀行へ提出する」にチェックを入れると Stripe の{" "}
        <code className="rounded bg-amber-100/80 px-0.5 text-[10px] dark:bg-amber-900/60">submit</code>{" "}
        が true になります（期限・運用は Stripe の表示に従ってください）。
      </p>
      <div className="mt-3 space-y-4">
        {rows.map((row) => (
          <div
            key={row.disputeId}
            className="rounded-md border border-border/70 bg-background/90 p-3 shadow-sm dark:bg-background/80"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{row.scopeLabel}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                金額: ¥{row.amountYen.toLocaleString("ja-JP")}
              </p>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">Dispute: {row.disputeId}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Stripe 状態: {row.stripeStatus}
              {row.dueByLabel ? ` · 証拠期限（参考）: ${row.dueByLabel}` : null}
            </p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor={`evidence-key-${row.disputeId}`} className="text-xs">
                  証拠の種類
                </Label>
                <select
                  id={`evidence-key-${row.disputeId}`}
                  name="evidenceKey"
                  className="h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
                  defaultValue="uncategorized_file"
                >
                  {DISPUTE_FILE_EVIDENCE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {EVIDENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`file-${row.disputeId}`} className="text-xs">
                  ファイル（PDF / PNG / JPEG、8MB 以下）
                </Label>
                <input
                  id={`file-${row.disputeId}`}
                  name="file"
                  type="file"
                  accept=".pdf,application/pdf,image/png,image/jpeg"
                  className="block w-full max-w-md text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  id={`bank-submit-${row.disputeId}`}
                  className="rounded border-input"
                />
                銀行へ提出する（最終提出。運用に注意）
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={loadingId === row.disputeId}
                  onClick={(e) => {
                    const form = (e.currentTarget as HTMLButtonElement).closest("form");
                    if (!form) return;
                    void submitEvidence(row.disputeId, form, false);
                  }}
                >
                  アップロードのみ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loadingId === row.disputeId}
                  onClick={(e) => {
                    const form = (e.currentTarget as HTMLButtonElement).closest("form");
                    if (!form) return;
                    const cb = form.querySelector<HTMLInputElement>(`#bank-submit-${row.disputeId}`);
                    if (cb && !cb.checked) {
                      toast.message("確認", {
                        description: "銀行へ提出する場合はチェックボックスにチェックを入れてください。",
                      });
                      return;
                    }
                    void submitEvidence(row.disputeId, form, Boolean(cb?.checked));
                  }}
                >
                  アップロードして提出
                </Button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
