"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";

type ActionMode = "approve" | "revoke" | "manual";

type Props = {
  competitionId: string;
  entryId: string;
  mode: ActionMode;
  fullName?: string;
  disabled?: boolean;
};

export default function CompetitionEntryPostPayActions({
  competitionId,
  entryId,
  mode,
  fullName,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (mode === "approve") {
      const ok = window.confirm(
        fullName
          ? `${fullName} のエントリーを後払いで成立させます。よろしいですか？`
          : "このエントリーを後払いで成立させます。よろしいですか？"
      );
      if (!ok) return;
    }
    if (mode === "revoke") {
      const ok = window.confirm(
        "後払い承認を取り消すと、未決済のエントリー試行に戻ります。よろしいですか？"
      );
      if (!ok) return;
    }
    if (mode === "manual") {
      const ok = window.confirm(
        fullName
          ? `${fullName} の参加費を手動で入金済みに記録します。よろしいですか？`
          : "参加費を手動で入金済みに記録します。よろしいですか？"
      );
      if (!ok) return;
    }

    let note: string | undefined;
    if (mode === "manual") {
      const input = window.prompt("入金メモ（任意・振込名義など）", "");
      if (input === null) return;
      const trimmed = input.trim();
      note = trimmed.length > 0 ? trimmed : undefined;
    }

    const path =
      mode === "approve"
        ? `/api/competitions/${competitionId}/entries/${entryId}/post-pay/approve`
        : mode === "revoke"
          ? `/api/competitions/${competitionId}/entries/${entryId}/post-pay/revoke`
          : `/api/competitions/${competitionId}/entries/${entryId}/manual-payment`;

    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: mode === "manual" ? { "Content-Type": "application/json" } : undefined,
        body: mode === "manual" ? JSON.stringify({ note }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.message === "string" ? data.message : "操作に失敗しました"
        );
      }
      toast.success(typeof data.message === "string" ? data.message : "完了しました");
      router.refresh();
    } catch (error) {
      toast.error(userFacingApiErrorMessage(error, "操作に失敗しました"));
    } finally {
      setLoading(false);
    }
  };

  const label =
    mode === "approve"
      ? loading
        ? "処理中…"
        : "後払いで成立"
      : mode === "revoke"
        ? loading
          ? "処理中…"
          : "承認取り消し"
        : loading
          ? "処理中…"
          : "手動入金済み";

  return (
    <Button
      type="button"
      variant={mode === "revoke" ? "outline" : "default"}
      size="sm"
      onClick={() => void run()}
      disabled={disabled || loading}
    >
      {label}
    </Button>
  );
}
