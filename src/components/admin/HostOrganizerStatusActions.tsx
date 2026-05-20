"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function HostOrganizerStatusActions({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onAction = async (action: "suspend" | "restore") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${organizationId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "suspend" ? { suspendedReason: "PF_SUSPEND" } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "操作に失敗しました");
      toast.success(action === "suspend" ? "主催団体を停止しました" : "主催団体を復旧しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (status === "SUSPENDED") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => onAction("restore")}
      >
        復旧
      </Button>
    );
  }

  if (status === "APPROVED" || status === "PENDING") {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={loading}
        onClick={() => onAction("suspend")}
      >
        停止
      </Button>
    );
  }

  return null;
}
