"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  organizationId: string;
  competitionId: string;
  /** この大会の公開ページにおけるスタートリスト全体（タイムスケジュール・全種目）を一般向けに出すか */
  initialVisible: boolean;
  /** 主催 org 管理者のみ true。false のときは何も描画しない */
  canManage: boolean;
};

export function StartListPublicToggleButton({
  organizationId,
  competitionId,
  initialVisible,
  canManage,
}: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(initialVisible);
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return null;
  }

  const onToggle = () => {
    const next = !visible;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-qualification-settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startListPubliclyVisible: next }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          competition?: { startListPubliclyVisible?: boolean };
        };
        if (!res.ok) {
          toast.error(data.error ?? "大会のスタートリスト公開設定の更新に失敗しました");
          return;
        }
        setVisible(Boolean(data.competition?.startListPubliclyVisible));
        router.refresh();
        toast.success(
          next
            ? "この大会のスタートリスト全体を公開しました（タイムスケジュール・全種目）"
            : "この大会のスタートリスト全体を非公開にしました（種目ごとの設定ではありません）"
        );
      } catch {
        toast.error("大会のスタートリスト公開設定の更新に失敗しました");
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={visible ? "default" : "outline"}
      className="h-8 min-w-[4.5rem]"
      disabled={isPending}
      onClick={onToggle}
      aria-label={
        visible
          ? "この大会のスタートリスト全体を公開中（タイムスケジュール・全種目）"
          : "この大会のスタートリスト全体を非公開にする"
      }
    >
      {visible ? "公開" : "非公開"}
    </Button>
  );
}
