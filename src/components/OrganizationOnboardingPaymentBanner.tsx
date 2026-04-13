"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface OrganizationOnboardingPaymentBannerProps {
  organizationId: string;
  amount: number;
}

export default function OrganizationOnboardingPaymentBanner({
  organizationId,
  amount,
}: OrganizationOnboardingPaymentBannerProps) {
  const [loading, setLoading] = useState(false);
  const formatted = new Intl.NumberFormat("ja-JP").format(amount);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/onboarding/checkout`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "利用料の登録を開始できませんでした");
        return;
      }
      if (!data.checkoutUrl) {
        toast.error("決済ページのURL取得に失敗しました");
        return;
      }
      window.location.href = data.checkoutUrl as string;
    } catch (error) {
      console.error("Onboarding checkout error:", error);
      toast.error("利用料の登録を開始できませんでした");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            プラットフォーム利用料（年額）のお支払いが必要です
          </p>
          <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
            正式利用には年額 {formatted} 円のサブスクリプション登録が必要です。決済完了後に主催団体が有効化されます。
          </p>
        </div>
        <Button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          className="sm:min-w-[170px]"
        >
          {loading ? "決済ページへ遷移中..." : "年額プランに登録する"}
        </Button>
      </div>
    </div>
  );
}

