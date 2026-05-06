"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CompetitionStripeSettlementAccountType } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  organizationId: string;
  competitionId: string;
  initialValue: CompetitionStripeSettlementAccountType;
};

export function CompetitionStripeSettlementSelect({
  organizationId,
  competitionId,
  initialValue,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<CompetitionStripeSettlementAccountType>(initialValue);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onChange = (next: string) => {
    const v = next as CompetitionStripeSettlementAccountType;
    if (v !== "ORGANIZER_CONNECT" && v !== "PLATFORM") return;

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/stripe-settlement-settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stripeSettlementAccountType: v }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "更新に失敗しました");
          setValue(initialValue);
          return;
        }
        setValue(v);
        router.refresh();
        toast.success("決済口座の設定を更新しました");
      } catch {
        toast.error("更新に失敗しました");
        setValue(initialValue);
      }
    });
  };

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 max-w-[220px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ORGANIZER_CONNECT">主催団体（Stripe Connect）</SelectItem>
        <SelectItem value="PLATFORM">プラットフォーム</SelectItem>
      </SelectContent>
    </Select>
  );
}
