"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import {
  markDayOpsUnlockedClient,
  useDayOpsUnlockEffective,
} from "@/hooks/useDayOpsUnlockEffective";

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
  const router = useRouter();
  const [code, setCode] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const unlocked = useDayOpsUnlockEffective(competitionId, alreadyUnlocked);

  if (!passphraseConfigured || unlocked) {
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
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(body.error || "アンロックに失敗しました");
        }
        markDayOpsUnlockedClient(competitionId);
        toast.success("当日運用モードを有効にしました");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "アンロックに失敗しました");
      }
    });
  };

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4">
      <p className="text-xs font-medium text-foreground">当日運用（マーシャル・リザルト等）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        通常の閲覧では暗号入力は不要です。主催から共有された場合のみ入力すると、このブラウザでマーシャル・リザルト・ヒート運用（当日のスタートリスト操作）が利用できます。公開ページのタイムスケジュールやラウンド数の編集は主催の管理者のみが行えます。
      </p>
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="dayops-unlock-form"
          disabled={pending}
        >
          {expanded ? "詳細設定を閉じる" : "当日運用暗号を入力する（必要な場合のみ）"}
        </Button>
      </div>
      {expanded ? (
        <AutofillSyncForm
          id="dayops-unlock-form"
          onSubmit={onSubmit}
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="dayops-code" className="text-xs">
              当日運用暗号（任意）
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
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              通常は入力不要です。主催から暗号が共有された場合のみ入力してください。有効化後はこの端末で大会終了まで再入力不要です。
            </p>
          </div>
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={pending}>
            {pending ? "確認中…" : "有効化"}
          </Button>
        </AutofillSyncForm>
      ) : null}
    </div>
  );
}
