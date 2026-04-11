"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  initiallyConfigured: boolean;
};

export default function CompetitionDayOpsPassphraseEditor({
  organizationId,
  competitionId,
  canEdit,
  initiallyConfigured,
}: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [pending, startTransition] = useTransition();
  const [configured, setConfigured] = useState(initiallyConfigured);

  if (!canEdit) {
    return (
      <p className="text-xs text-muted-foreground">
        当日運用暗号: {configured ? "設定済み（主催管理者のみ変更可）" : "未設定"}
      </p>
    );
  }

  const save = (clear: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/day-ops-access`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passphrase: clear ? null : passphrase.trim() }),
          }
        );
        const body = (await res.json().catch(() => ({}))) as { error?: string; configured?: boolean };
        if (!res.ok) {
          throw new Error(body.error || "保存に失敗しました");
        }
        setConfigured(Boolean(body.configured));
        setPassphrase("");
        toast.success(clear ? "当日運用暗号を削除しました" : "当日運用暗号を保存しました");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().length < 6) {
      toast.error("暗号は6文字以上にしてください");
      return;
    }
    save(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/15 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">当日運用アクセス暗号</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          大会ページ・スタートリストで入力すると、ログインなしでもマーシャル・リザルト等の当日運用が可能になります。会場スタッフにのみ共有してください。
        </p>
        <p className="mt-2 text-xs font-medium text-foreground">
          状態: {configured ? "設定済み" : "未設定"}
        </p>
      </div>
      <AutofillSyncForm onSubmit={onSubmit} className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="dayops-pass-new" className="text-xs">
            新しい暗号（6文字以上）
          </Label>
          <Input
            id="dayops-pass-new"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(ev) => setPassphrase(ev.target.value)}
            className="h-9 max-w-md"
            disabled={pending}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !configured}
            onClick={() => {
              if (!window.confirm("当日運用暗号を削除します。よろしいですか？")) return;
              save(true);
            }}
          >
            削除
          </Button>
        </div>
      </AutofillSyncForm>
    </div>
  );
}
