"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ChevronDown, Loader2, Mail } from "lucide-react";
import {
  entriesCollapsibleClassName,
  entriesCollapsibleSummaryClassName,
  EntriesIconBadge,
} from "@/components/admin/competitionEntriesTabUi";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";

type CampaignSummary = {
  id: string;
  sentAt: string;
  responseDeadlineAt: string;
  participateCount: number;
  withdrawCount: number;
  deadlineDnsCount: number;
  pendingCount: number;
  totalTokens: number;
  actionRequiredCount: number;
  emailDeliveredCount: number;
  emailUndeliveredCount: number;
  currentUnpaidTargetCount: number;
};

type Props = {
  competitionId: string;
  initialCampaign: CampaignSummary | null;
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDeadlineLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setMinutes(0, 0, 0);
  return toDatetimeLocalValue(d);
}

export default function CompetitionUnpaidIntentBulkMailPanel({
  competitionId,
  initialCampaign,
}: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ targetCount: number; skippedNoEmail: number } | null>(
    null
  );
  const campaignSent = initialCampaign != null;
  const [deadlineLocal, setDeadlineLocal] = useState(() => {
    if (initialCampaign) {
      return toDatetimeLocalValue(new Date(initialCampaign.responseDeadlineAt));
    }
    return defaultDeadlineLocal();
  });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const campaign = initialCampaign;

  const deadlinePassed =
    campaign != null && Date.now() > new Date(campaign.responseDeadlineAt).getTime();
  const allEmailFailed =
    campaign != null &&
    campaign.totalTokens > 0 &&
    campaign.emailDeliveredCount === 0;
  const needsResend =
    campaign != null &&
    (campaign.emailUndeliveredCount > 0 ||
      campaign.currentUnpaidTargetCount > campaign.actionRequiredCount);

  const loadPreview = useCallback(async () => {
    if (campaignSent) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/unpaid-intent/send-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "プレビューに失敗しました");
      }
      setPreview({
        targetCount: Number(data.targetCount) || 0,
        skippedNoEmail: Number(data.skippedNoEmail) || 0,
      });
    } catch (e) {
      toast.error(userFacingApiErrorMessage(e, "プレビューに失敗しました"));
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [campaignSent, competitionId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const parseDeadline = (): Date | null => {
    if (!deadlineLocal) return null;
    const deadline = new Date(deadlineLocal);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      return null;
    }
    return deadline;
  };

  const sendBulk = async () => {
    if (campaignSent) {
      toast.error("この大会では既に一括送信済みです。未達分は「再送」から送ってください。");
      return;
    }
    const deadline = parseDeadline();
    if (!deadline) {
      toast.error("回答期限を入力してください（未来の日時）");
      return;
    }
    const count = preview?.targetCount ?? 0;
    if (
      !window.confirm(
        `未決済 ${count} 件にメールを送信します。回答期限: ${deadline.toLocaleString("ja-JP")}。よろしいですか？`
      )
    ) {
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/unpaid-intent/send-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseDeadlineAt: deadline.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(typeof data.message === "string" ? data.message : "送信に失敗しました");
      }
      const failed = Number(data.failedCount) || 0;
      const sent = Number(data.sentCount) || 0;
      if (sent === 0) {
        toast.error(
          typeof data.message === "string"
            ? data.message
            : "メールを1件も送信できませんでした。RESEND の設定を確認してください。"
        );
      } else if (failed > 0) {
        toast.warning(data.message ?? `送信 ${sent} 件、失敗 ${failed} 件`);
      } else {
        toast.success(
          "送信しました。参加者の回答と、期限後の未回答者への欠場（DNS）は自動で処理されます（おおむね15分以内）。"
        );
      }
      router.refresh();
    } catch (e) {
      toast.error(userFacingApiErrorMessage(e, "送信に失敗しました"));
    } finally {
      setSending(false);
    }
  };

  const resendFailed = async () => {
    const deadline = parseDeadline();
    if (!deadline) {
      toast.error("回答期限を未来の日時に設定してから再送してください");
      return;
    }
    const undelivered = campaign?.emailUndeliveredCount ?? 0;
    const newTargets = Math.max(
      0,
      (campaign?.currentUnpaidTargetCount ?? 0) - (campaign?.actionRequiredCount ?? 0)
    );
    if (
      !window.confirm(
        `未達 ${undelivered} 件＋新規未送信 ${newTargets} 件を再送します。回答期限: ${deadline.toLocaleString("ja-JP")}。よろしいですか？`
      )
    ) {
      return;
    }

    setResending(true);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/unpaid-intent/resend-failed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responseDeadlineAt: deadline.toISOString() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(typeof data.message === "string" ? data.message : "再送に失敗しました");
      }
      const failed = Number(data.failedCount) || 0;
      const sent = Number(data.sentCount) || 0;
      if (sent === 0 && failed === 0) {
        toast.info(data.message ?? "再送対象がありませんでした");
      } else if (sent === 0) {
        toast.error(data.message ?? "再送に失敗しました");
      } else if (failed > 0) {
        toast.warning(data.message ?? `再送 ${sent} 件、失敗 ${failed} 件`);
      } else {
        toast.success(data.message ?? `メールを ${sent} 件送信しました`);
      }
      router.refresh();
    } catch (e) {
      toast.error(userFacingApiErrorMessage(e, "再送に失敗しました"));
    } finally {
      setResending(false);
    }
  };

  const [expanded, setExpanded] = useState(() => allEmailFailed || needsResend);

  const collapsedSummary = (() => {
    if (allEmailFailed) {
      return `メール未達 ${campaign?.emailUndeliveredCount ?? 0} 件 — 再送が必要です`;
    }
    if (campaign) {
      const parts = [`要回答 ${campaign.actionRequiredCount} 件`];
      if (campaign.emailUndeliveredCount > 0) {
        parts.push(`未達 ${campaign.emailUndeliveredCount} 件`);
      }
      return parts.join(" · ");
    }
    if (preview) {
      return `送信対象 ${preview.targetCount} 件`;
    }
    if (loadingPreview) {
      return "対象を確認中…";
    }
    return "回答期限を設定して一括送信";
  })();

  return (
    <details
      className={entriesCollapsibleClassName}
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className={entriesCollapsibleSummaryClassName}>
        <EntriesIconBadge tone={allEmailFailed ? "amber" : "primary"}>
          <Mail className="size-4" strokeWidth={1.75} aria-hidden />
        </EntriesIconBadge>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">未決済者への出場意思確認メール</h3>
          <p
            className={`truncate text-xs group-open:hidden ${allEmailFailed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {collapsedSummary}
          </p>
        </div>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          回答期限を設定して一括送信するだけで、以降は自動です。参加者はメールのリンクから出場または棄権（エントリー取消）を選び、期限を過ぎた未回答者には欠場（DNS）が付きます。出場と回答した方はログイン後に参加費をお支払いください。
        </p>

        {allEmailFailed ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            前回の一括送信でメールが1件も届いていません（{campaign?.emailUndeliveredCount}{" "}
            件未達）。「未達分を再送」で送信してください。
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="intent-deadline">
              回答期限{campaignSent ? "（再送時に更新可）" : ""}
            </label>
            <Input
              id="intent-deadline"
              type="datetime-local"
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
              disabled={campaignSent && !needsResend && !deadlinePassed}
              className="h-8 w-[min(100%,15rem)] text-sm"
            />
          </div>

          {!campaignSent ? (
            <div className="flex flex-wrap items-center gap-2">
              {preview ? (
                <p className="text-xs text-muted-foreground">
                  対象{" "}
                  <span className="font-semibold text-foreground">{preview.targetCount}</span> 件
                  {preview.skippedNoEmail > 0 ? (
                    <span className="hidden sm:inline">
                      （未登録 {preview.skippedNoEmail} 件除外）
                    </span>
                  ) : null}
                </p>
              ) : loadingPreview ? (
                <p className="text-xs text-muted-foreground">
                  <Loader2 className="inline h-3 w-3 animate-spin" />
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => void sendBulk()}
                disabled={sending || loadingPreview}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "一括送信"}
              </Button>
            </div>
          ) : null}

          {campaignSent && (needsResend || allEmailFailed || deadlinePassed) ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={allEmailFailed ? "default" : "secondary"}
              onClick={() => void resendFailed()}
              disabled={resending}
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : "未達分を再送"}
            </Button>
          ) : null}
        </div>

        {campaign ? (
          <dl className="grid gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-muted/15 px-2.5 py-2 text-xs sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="sr-only">直近の送信</dt>
              <dd className="font-medium text-foreground">直近の送信</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">送信日時</dt>
              <dd>{new Date(campaign.sentAt).toLocaleString("ja-JP")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">回答期限</dt>
              <dd>{new Date(campaign.responseDeadlineAt).toLocaleString("ja-JP")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">メール到達</dt>
              <dd>
                {campaign.emailDeliveredCount} 件
                {campaign.emailUndeliveredCount > 0 ? (
                  <span className="text-destructive"> / 未達 {campaign.emailUndeliveredCount}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">回答状況</dt>
              <dd>
                出場 {campaign.participateCount} / 棄権 {campaign.withdrawCount} / 未回答{" "}
                {campaign.pendingCount}
              </dd>
            </div>
            <div className="sm:col-span-2 text-muted-foreground">
              要回答・未決済 {campaign.actionRequiredCount} 件
              {campaign.deadlineDnsCount > 0 ? (
                <span> · 期限処理済 {campaign.deadlineDnsCount}</span>
              ) : null}
            </div>
          </dl>
        ) : null}
      </div>
    </details>
  );
}
