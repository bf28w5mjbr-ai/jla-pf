"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";

type OrganizationStripeConnectPanelProps = {
  organizationId: string;
  chargesEnabled: boolean;
};

export default function OrganizationStripeConnectPanel({
  organizationId,
  chargesEnabled,
}: OrganizationStripeConnectPanelProps) {
  const [loading, setLoading] = useState(false);

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
      let data: { error?: string; url?: string } = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as { error?: string; url?: string };
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        const msg =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : res.status === 401
              ? "ログインの有効期限が切れている可能性があります。再度ログインしてください。"
              : res.status === 403
                ? "この操作を行う権限がありません。"
                : "Stripe の設定画面を開けませんでした";
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
        {!chargesEnabled ? (
          <Button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            variant="secondary"
            className="sm:min-w-[200px]"
          >
            {loading ? "接続処理中..." : "口座・本人確認を行う"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
