"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  competitionId: string;
  entryId: string;
  disabled?: boolean;
  className?: string;
};

export default function EntryWithdrawRequestButton({
  competitionId,
  entryId,
  disabled = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeDialog = () => {
    setOpen(false);
    setStep(1);
  };

  const submitWithdraw = async (reason: string) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/entries/${entryId}/withdraw`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "棄権申請に失敗しました");
      }

      toast.success(data.message || "棄権申請を受け付けました");
      window.location.reload();
    } catch (error) {
      console.error("Entry withdraw request error:", error);
      toast.error(error instanceof Error ? error.message : "棄権申請に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSend = () => {
    closeDialog();
    const reasonInput = window.prompt("棄権理由（任意）", "");
    if (reasonInput === null) return;
    void submitWithdraw(reasonInput);
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={cn(className)}
        disabled={disabled || isSubmitting}
        onClick={() => {
          setStep(1);
          setOpen(true);
        }}
      >
        {isSubmitting ? "申請中..." : "棄権申請"}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setStep(1);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            {step === 1 ? (
              <>
                <AlertDialogTitle>棄権申請</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      このエントリーに含まれる<strong className="text-foreground">個人種目</strong>
                      について、棄権の申請を行います。
                    </p>
                    <p>
                      主催者の確認のうえ、種目が棄権扱いとなる場合があります。誤操作を防ぐため、次の画面で
                      <strong className="text-foreground">内容を再確認</strong>してください。
                    </p>
                  </div>
                </AlertDialogDescription>
              </>
            ) : (
              <>
                <AlertDialogTitle>再確認</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      本当に棄権申請を送信しますか？
                    </p>
                    <p>
                      送信後はこの画面から取り消すことはできません。主催者の対応や大会規定に沿って処理されます。
                    </p>
                    <p>続けると、棄権理由の入力（任意）に進みます。</p>
                  </div>
                </AlertDialogDescription>
              </>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {step === 1 ? (
              <>
                <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                <Button type="button" onClick={() => setStep(2)}>
                  次へ（確認）
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  戻る
                </Button>
                <Button type="button" variant="destructive" onClick={handleConfirmSend}>
                  棄権申請を送信
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
