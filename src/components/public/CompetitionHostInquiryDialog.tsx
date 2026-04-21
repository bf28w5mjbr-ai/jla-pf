"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  competitionId: string;
  competitionName: string;
  /** ログイン済みのとき DB に基づく氏名プレビュー */
  senderNamePreview: string;
  isAuthenticated: boolean;
  loginHref: string;
};

export function CompetitionHostInquiryDialog({
  competitionId,
  competitionName,
  senderNamePreview,
  isAuthenticated,
  loginHref,
}: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("メッセージを入力してください");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/host-inquiry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "送信に失敗しました");
        }
        toast.success("主催者と運営宛に送信しました");
        setMessage("");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "送信に失敗しました");
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" asChild>
        <Link href={loginHref}>
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          主催へ問い合わせ（要ログイン）
        </Link>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          主催へ問い合わせ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>主催への問い合わせ</DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed">
            大会「{competitionName}」について、主催団体の管理者と Bluvium 運営宛にメールが送信されます。返信はあなたの登録メールアドレス宛になります。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-left text-xs leading-relaxed text-muted-foreground">
            氏名・クラブ所属は、プロフィール登録内容に基づき送信メールに自動で含まれます（ここでの入力は不要です）。
          </p>
          <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground">
            <span className="font-medium text-muted-foreground">氏名（自動付与）</span>
            <p className="mt-1 font-medium">{senderNamePreview}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="host-inquiry-message">メッセージ</Label>
            <Textarea
              id="host-inquiry-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="お問い合わせ内容をご記入ください"
              rows={6}
              maxLength={3500}
              disabled={isPending}
              className="resize-y"
            />
            <p className="text-right text-[11px] text-muted-foreground">{message.length} / 3500</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            キャンセル
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending}>
            {isPending ? "送信中…" : "送信する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
