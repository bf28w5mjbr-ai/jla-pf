"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TechnicalOfficialRecruitmentToggleButtonProps = {
  organizationId: string;
  competitionId: string;
  initialEnabled: boolean;
  disabled?: boolean;
};

export function TechnicalOfficialRecruitmentToggleButton({
  organizationId,
  competitionId,
  initialEnabled,
  disabled = false,
}: TechnicalOfficialRecruitmentToggleButtonProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    const next = !enabled;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/technical-official-settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ technicalOfficialRecruitmentEnabled: next }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          competition?: { technicalOfficialRecruitmentEnabled?: boolean };
        };
        if (!res.ok) {
          toast.error(data.error ?? "TO機能設定の更新に失敗しました");
          return;
        }
        setEnabled(Boolean(data.competition?.technicalOfficialRecruitmentEnabled));
        router.refresh();
        toast.success(next ? "TO機能をONにしました" : "TO機能をOFFにしました");
      } catch {
        toast.error("TO機能設定の更新に失敗しました");
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={enabled ? "default" : "outline"}
      className="h-8 min-w-[4.5rem]"
      disabled={isPending || disabled}
      onClick={onToggle}
    >
      {enabled ? "ON" : "OFF"}
    </Button>
  );
}
