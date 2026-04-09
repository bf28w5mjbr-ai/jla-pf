"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  competitionId: string;
  entryId: string;
  disabled?: boolean;
};

export default function CompetitionEntryAdminActions({
  competitionId,
  entryId,
  disabled = false,
}: Props) {
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    const confirmed = window.confirm("このエントリーを取消し、必要なら返金します。続行しますか？");
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/entries/${entryId}/cancel`,
        {
          method: "POST",
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "エントリー取消に失敗しました");
      }

      toast.success(data.message || "エントリーを取消しました");
      window.location.reload();
    } catch (error) {
      console.error("Competition entry cancel error:", error);
      toast.error(error instanceof Error ? error.message : "エントリー取消に失敗しました");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCancel}
      disabled={disabled || isCancelling}
    >
      {isCancelling ? "取消中..." : "取消 / 返金"}
    </Button>
  );
}
