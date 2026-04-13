"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, RefreshCw } from "lucide-react";

type OrganizationStripeConnectPanelProps = {
  organizationId: string;
  chargesEnabled: boolean;
};

export default function OrganizationStripeConnectPanel({
  organizationId,
  chargesEnabled,
}: OrganizationStripeConnectPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);

  const handleCheckStatus = async () => {
    setCheckLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/stripe-connect/status?sync=1`,
        { credentials: "include" }
      );
      let data: {
        error?: string;
        issues?: string[];
        paidEntryBlockReason?: string | null;
        readyForPaidEntries?: boolean;
        stripe?: { chargesEnabled?: boolean; currentlyDueCount?: number } | null;
      } = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : "状態の取得に失敗しました"
        );
        return;
      }
      const lines = [...(data.issues ?? [])];
      if (data.paidEntryBlockReason && !lines.includes(data.paidEntryBlockReason)) {
        lines.unshift(data.paidEntryBlockReason);
      }
      const description = lines.filter(Boolean).join("\n") || "問題は検出されませんでした。";
      if (data.readyForPaidEntries) {
        toast.success("Stripe Connect の確認", { description });
      } else {
        toast.warning("Stripe Connect に要確認があります", { description });
      }
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error("状態の取得に失敗しました");
    } finally {
      setCheckLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/stripe-connect/account-link`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      let data: {
        error?: string;
        url?: string;
        stripeDetail?: string | null;
        stripeCode?: string | null;
        stripeParam?: string | null;
        stripeType?: string | null;
        stripeActionUrl?: string | null;
      } = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        const base =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : res.status === 401
              ? "ログインの有効期限が切れている可能性があります。再度ログインしてください。"
              : res.status === 403
                ? "この操作を行う権限がありません。"
                : "Stripe の設定画面を開けませんでした";
        const primary =
          typeof data.stripeDetail === "string" && data.stripeDetail.trim() ? data.stripeDetail.trim() : null;
        const meta = [
          typeof data.stripeCode === "string" && data.stripeCode.trim() ? `code=${data.stripeCode.trim()}` : null,
          typeof data.stripeParam === "string" && data.stripeParam.trim() ? `param=${data.stripeParam.trim()}` : null,
          typeof data.stripeType === "string" && data.stripeType.trim() ? `type=${data.stripeType.trim()}` : null,
        ].filter(Boolean);
        const line =
          primary && meta.length > 0
            ? `${primary} (${meta.join(" · ")})`
            : primary || meta.join(" · ") || "";
        const detail = line ? `\n\nStripe からのメッセージ: ${line}` : "";
        const action =
          typeof data.stripeActionUrl === "string" && data.stripeActionUrl.trim()
            ? `\n\n設定ページ: ${data.stripeActionUrl.trim()}`
            : "";
        const msg = `${base}${detail}${action}`;
        toast.error(msg);
        return;
      }
      if (!data.url) {
        toast.error("リンクを取得できませんでした");
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Stripe の設定画面を開けませんでした");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-sky-300/80 bg-sky-50/90 p-3 dark:border-sky-900/50 dark:bg-sky-950/25 sm:p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-950 dark:text-sky-100 sm:text-sm">
            <CreditCard className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
            エントリー代の受け取り（Connect）
          </p>
          <p className="text-[11px] leading-snug text-sky-900/90 dark:text-sky-200/90 sm:text-xs">
            参加費は Connect 口座へ（PF 手数料を除く）。
            {chargesEnabled ? " 受付可能です。" : " 初回は Stripe で事業者登録が必要です。"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            onClick={handleCheckStatus}
            disabled={checkLoading || loading}
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs sm:h-9 sm:min-w-0 sm:px-3 sm:text-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${checkLoading ? "animate-spin" : ""}`} aria-hidden />
            {checkLoading ? "確認中..." : "状態を確認"}
          </Button>
          {!chargesEnabled ? (
            <Button
              type="button"
              onClick={handleConnect}
              disabled={loading || checkLoading}
              variant="secondary"
              size="sm"
              className="h-8 text-xs sm:h-9 sm:text-sm"
            >
              {loading ? "処理中..." : "口座・本人確認"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
