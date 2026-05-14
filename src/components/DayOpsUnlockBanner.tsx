"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";

type Props = {
  competitionId: string;
  /** 主催が DB に暗号ハッシュを設定済みか（ハッシュ本体は渡さない） */
  passphraseConfigured: boolean;
  /** サーバでクッキー検証済み */
  alreadyUnlocked: boolean;
};

export default function DayOpsUnlockBanner({
  competitionId,
  passphraseConfigured,
  alreadyUnlocked,
}: Props) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  if (!passphraseConfigured || alreadyUnlocked) {
    return null;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      toast.error("暗号を4文字以上で入力してください");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/day-ops-unlock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(body.error || "アンロックに失敗しました");
        }
        toast.success("当日運用モードを有効にしました");
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "アンロックに失敗しました");
      }
    });
  };

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4">
      <p className="text-xs font-medium text-foreground">当日運用（マーシャル・リザルト等）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        主催から共有された暗号を入力すると、このブラウザでマーシャル・リザルト・ヒート運用（当日のスタートリスト操作）が利用できます。公開ページのタイムスケジュールやラウンド数の編集は主催の管理者のみが行えます。
      </p>
      <AutofillSyncForm onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="dayops-code" className="text-xs">
            当日運用暗号
          </Label>
          <Input
            id="dayops-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            className="h-9"
            disabled={pending}
          />
        </div>
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={pending}>
          {pending ? "確認中…" : "有効化"}
        </Button>
      </AutofillSyncForm>
    </div>
  );
}
