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
      let data: { error?: string; url?: string; stripeDetail?: string; stripeCode?: string } = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as { error?: string; url?: string };
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
        const detail =
          typeof data.stripeDetail === "string" && data.stripeDetail.trim()
            ? `\n\nStripe からのメッセージ: ${data.stripeDetail.trim()}`
            : "";
        const msg = `${base}${detail}`;
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
    <div className="rounded-xl border border-sky-300/80 bg-sky-50/90 p-4 dark:border-sky-900/50 dark:bg-sky-950/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-sky-950 dark:text-sky-100">
            <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
            エントリー代の受け取り口座（Stripe Connect）
          </p>
          <p className="text-xs leading-relaxed text-sky-900/90 dark:text-sky-200/90">
            参加者からのエントリー代は、ご登録の Connect アカウントへ送金されます（プラットフォーム手数料を除く）。
            {chargesEnabled
              ? " 現在、決済を受け付け可能な状態です。"
              : " 初回のみ Stripe の画面で事業者情報の登録が必要です。"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            onClick={handleCheckStatus}
            disabled={checkLoading || loading}
            variant="outline"
            size="sm"
            className="gap-1.5 sm:min-w-[200px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${checkLoading ? "animate-spin" : ""}`} aria-hidden />
            {checkLoading ? "確認中..." : "接続状態を確認"}
          </Button>
          {!chargesEnabled ? (
            <Button
              type="button"
              onClick={handleConnect}
              disabled={loading || checkLoading}
              variant="secondary"
              className="sm:min-w-[200px]"
            >
              {loading ? "接続処理中..." : "口座・本人確認を行う"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
