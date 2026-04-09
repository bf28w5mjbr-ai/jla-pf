"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type OfficialRecruitmentToggleButtonProps = {
  organizationId: string;
  competitionId: string;
  initialEnabled: boolean;
};

export function OfficialRecruitmentToggleButton({
  organizationId,
  competitionId,
  initialEnabled,
}: OfficialRecruitmentToggleButtonProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    const next = !enabled;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-qualification-settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ officialRecruitmentEnabled: next }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          competition?: { officialRecruitmentEnabled?: boolean };
        };
        if (!res.ok) {
          toast.error(data.error ?? "オフィシャル募集設定の更新に失敗しました");
          return;
        }
        setEnabled(Boolean(data.competition?.officialRecruitmentEnabled));
        router.refresh();
        toast.success(next ? "オフィシャル募集をONにしました" : "オフィシャル募集をOFFにしました");
      } catch {
        toast.error("オフィシャル募集設定の更新に失敗しました");
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={enabled ? "default" : "outline"}
      className="h-8 min-w-[4.5rem]"
      disabled={isPending}
      onClick={onToggle}
    >
      {enabled ? "ON" : "OFF"}
    </Button>
  );
}
