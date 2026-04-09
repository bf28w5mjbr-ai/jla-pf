"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CompetitionStatusToggleButtonProps = {
  competitionId: string;
  status: "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED" | "CANCELLED";
  canEdit: boolean;
  className?: string;
};

export default function CompetitionStatusToggleButton({
  competitionId,
  status,
  canEdit,
  className,
}: CompetitionStatusToggleButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!canEdit || (status !== "DRAFT" && status !== "PUBLISHED")) {
    return null;
  }

  const handleTogglePublish = async () => {
    if (isUpdating) return;

    const newStatus = status === "DRAFT" ? "PUBLISHED" : "DRAFT";
    const confirmMessage =
      newStatus === "PUBLISHED"
        ? "この大会を公開しますか？\n一般ユーザーに大会情報が表示されるようになります。"
        : "この大会を非公開にしますか？\n一般ユーザーから見えなくなります。";

    if (!confirm(confirmMessage)) return;

    setIsUpdating(true);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as
          | { error?: string; details?: string[] }
          | null;
        const detailMessage =
          errorData?.details && errorData.details.length > 0
            ? `\n${errorData.details.join("\n")}`
            : "";
        throw new Error(
          `${errorData?.error || "ステータスの更新に失敗しました"}${detailMessage}`
        );
      }

      toast.success(newStatus === "PUBLISHED" ? "公開しました" : "非公開にしました");
      router.refresh();
    } catch (error) {
      console.error("Status update error:", error);
      toast.error(error instanceof Error ? error.message : "ステータスの更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      variant={status === "DRAFT" ? "default" : "outline"}
      size="sm"
      onClick={handleTogglePublish}
      disabled={isUpdating}
      className={cn("w-full gap-2 sm:w-auto", className)}
    >
      {status === "DRAFT" ? (
        <>
          <Eye className="h-4 w-4" />
          公開する
        </>
      ) : (
        <>
          <EyeOff className="h-4 w-4" />
          非公開にする
        </>
      )}
    </Button>
  );
}
