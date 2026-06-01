"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
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
  const codeInputRef = useRef<HTMLInputElement>(null);
  const unlocked = useDayOpsUnlockEffective(competitionId, alreadyUnlocked);

  useEffect(() => {
    if (expanded) {
      codeInputRef.current?.focus();
    }
  }, [expanded]);

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

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-controls="dayops-unlock-form"
        disabled={pending}
      >
        マーシャル・リザルト
      </Button>
    );
  }

  return (
    <AutofillSyncForm
      id="dayops-unlock-form"
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-2"
    >
      <Label htmlFor="dayops-code" className="sr-only">
        当日運用暗号
      </Label>
      <Input
        ref={codeInputRef}
        id="dayops-code"
        type="password"
        autoComplete="off"
        placeholder="当日運用暗号"
        value={code}
        onChange={(ev) => setCode(ev.target.value)}
        className="h-8 w-full min-w-[10rem] max-w-xs placeholder:text-muted-foreground/55"
        disabled={pending}
      />
      <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-xs" disabled={pending}>
        {pending ? "確認中…" : "有効化"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs text-muted-foreground"
        onClick={() => {
          setExpanded(false);
          setCode("");
        }}
        disabled={pending}
        aria-expanded
        aria-controls="dayops-unlock-form"
      >
        閉じる
      </Button>
    </AutofillSyncForm>
  );
}
