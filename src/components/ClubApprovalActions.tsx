"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClubApprovalActionsProps {
  clubId: string;
  currentStatus: string;
}

export default function ClubApprovalActions({ clubId, currentStatus }: ClubApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleTransition = async (action: "suspend" | "restore") => {
    const confirmMessages: Record<string, string> = {
      suspend: "このクラブを停止しますか？",
      restore: "このクラブの運用を再開しますか？",
    };

    if (!confirm(confirmMessages[action])) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "ステータスの更新に失敗しました");
      }

      router.refresh();
    } catch (error) {
      console.error("Update status error:", error);
      alert(error instanceof Error ? error.message : "ステータスの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus === "APPROVED") {
    return (
      <Button
        onClick={() => handleTransition("suspend")}
        disabled={loading}
        size="sm"
        variant="destructive"
        className="h-8 text-xs"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        停止
      </Button>
    );
  }

  if (currentStatus === "SUSPENDED") {
    return (
      <Button
        onClick={() => handleTransition("restore")}
        disabled={loading}
        size="sm"
        className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        運用再開
      </Button>
    );
  }

  return null;
}
