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
    <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 dark:border-amber-900/50 dark:bg-amber-950/30 sm:p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 sm:text-sm">
            年額利用料のお支払いが必要です
          </p>
          <p className="text-[11px] leading-snug text-amber-800/90 dark:text-amber-200/90 sm:text-xs">
            年額 {formatted} 円。決済完了後に主催団体が有効化されます。
          </p>
        </div>
        <Button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          size="sm"
          className="h-8 shrink-0 text-xs sm:h-9 sm:min-w-[160px] sm:text-sm"
        >
          {loading ? "遷移中..." : "年額プランに登録"}
        </Button>
      </div>
    </div>
  );
}

