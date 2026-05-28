"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
};

type Props = {
  competitionId: string;
  initialCampaign: CampaignSummary | null;
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setMinutes(0, 0, 0);
    return toDatetimeLocalValue(d);
  });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const campaign = initialCampaign;

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

  const sendBulk = async () => {
    if (campaignSent) {
      toast.error("この大会では既に一括送信済みです");
      return;
    }
    if (!deadlineLocal) {
      toast.error("回答期限を入力してください");
      return;
    }
    const deadline = new Date(deadlineLocal);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      toast.error("回答期限は未来の日時を指定してください");
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
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "送信に失敗しました");
      }
      toast.success(
        "送信しました。参加者の回答と、期限後の未回答者への欠場（DNS）は自動で処理されます（おおむね15分以内）。出場者の決済は参加者側、当日現金は「後払い承認済み（入金待ち）」で手動入金してください。"
      );
      router.refresh();
    } catch (e) {
      toast.error(userFacingApiErrorMessage(e, "送信に失敗しました"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">未決済者への出場意思確認メール</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          回答期限を設定して一括送信するだけで、以降は自動です。参加者はメールのリンクから出場または棄権（エントリー取消）を選び、期限を過ぎた未回答者には欠場（DNS）が付きます。出場と回答した方はログイン後に参加費をお支払いください。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="intent-deadline">
            回答期限
          </label>
          <Input
            id="intent-deadline"
            type="datetime-local"
            value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            disabled={campaignSent}
            className="w-[min(100%,16rem)]"
          />
        </div>
      </div>

      {campaignSent ? (
        <p className="text-xs text-muted-foreground">
          一括送信済みのため、回答期限の変更と再送信はできません。
        </p>
      ) : preview ? (
        <p className="text-xs text-muted-foreground">
          送信対象: <span className="font-semibold text-foreground">{preview.targetCount}</span> 件
          {preview.skippedNoEmail > 0 ? (
            <span>（メール未登録 {preview.skippedNoEmail} 件は除外）</span>
          ) : null}
          {loadingPreview ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}
        </p>
      ) : loadingPreview ? (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="inline h-3 w-3 animate-spin" /> 対象を確認中…
        </p>
      ) : null}

      {!campaignSent ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void sendBulk()}
            disabled={sending || loadingPreview}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "一括メール送信"}
          </Button>
        </div>
      ) : null}

      {campaign ? (
        <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
          <p className="font-medium text-foreground">直近の送信</p>
          <p>
            送信: {new Date(campaign.sentAt).toLocaleString("ja-JP")} / 期限:{" "}
            {new Date(campaign.responseDeadlineAt).toLocaleString("ja-JP")}
          </p>
          <p>
            回答: 出場 {campaign.participateCount} / 棄権 {campaign.withdrawCount} / 未回答{" "}
            {campaign.pendingCount}
            {campaign.deadlineDnsCount > 0 ? (
              <span> / 期限欠場 {campaign.deadlineDnsCount}</span>
            ) : null}
            （全 {campaign.totalTokens} 件）
          </p>
          <p className="text-muted-foreground">
            期限後の未回答処理は自動です（おおむね15分以内）。
          </p>
        </div>
      ) : null}
    </section>
  );
}
