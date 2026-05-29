"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { WithdrawableEventOption } from "@/lib/entryWithdrawalRequest";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  competitionId: string;
  entryId: string;
  withdrawableEvents: WithdrawableEventOption[];
  disabled?: boolean;
  className?: string;
};

export default function EntryWithdrawRequestButton({
  competitionId,
  entryId,
  withdrawableEvents,
  disabled = false,
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  const selectableEvents = useMemo(
    () => withdrawableEvents.filter((event) => !event.alreadyWithdrawn && !event.callClosed),
    [withdrawableEvents]
  );

  const selectedLabels = useMemo(
    () =>
      selectedEventIds
        .map((id) => withdrawableEvents.find((event) => event.eventId === id)?.label ?? id)
        .filter(Boolean),
    [selectedEventIds, withdrawableEvents]
  );

  const resetDialogState = () => {
    setStep(1);
    setSelectedEventIds([]);
  };

  const closeDialog = () => {
    setOpen(false);
    resetDialogState();
  };

  const toggleEvent = (eventId: string, checked: boolean) => {
    setSelectedEventIds((prev) =>
      checked ? [...prev, eventId] : prev.filter((id) => id !== eventId)
    );
  };

  const submitWithdraw = async (reason: string, eventIds: string[]) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/entries/${entryId}/withdraw`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, eventIds }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "棄権申請に失敗しました");
      }

      toast.success(data.message || "棄権申請を受け付けました");
      router.refresh();
    } catch (error) {
      console.error("Entry withdraw request error:", error);
      toast.error(error instanceof Error ? error.message : "棄権申請に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSend = () => {
    const eventIds = [...selectedEventIds];
    closeDialog();
    const reasonInput = window.prompt("棄権理由（任意）", "");
    if (reasonInput === null) return;
    void submitWithdraw(reasonInput, eventIds);
  };

  const canProceed = selectedEventIds.length > 0;

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={cn(className)}
        disabled={disabled || isSubmitting || selectableEvents.length === 0}
        onClick={() => {
          resetDialogState();
          setOpen(true);
        }}
      >
        {isSubmitting ? "申請中..." : "棄権申請"}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetDialogState();
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            {step === 1 ? (
              <>
                <AlertDialogTitle>棄権申請</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>棄権する種目を選択してください（個人種目のみ）。</p>
                    <ul className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
                      {withdrawableEvents.map((event) => {
                        const isSelectable = !event.alreadyWithdrawn && !event.callClosed;
                        const checkboxId = `withdraw-event-${entryId}-${event.eventId}`;
                        return (
                          <li key={event.eventId} className="flex items-start gap-2">
                            <Checkbox
                              id={checkboxId}
                              checked={selectedEventIds.includes(event.eventId)}
                              disabled={!isSelectable}
                              onCheckedChange={(checked) =>
                                toggleEvent(event.eventId, checked === true)
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <Label
                                htmlFor={checkboxId}
                                className={cn(
                                  "text-sm font-medium leading-snug",
                                  !isSelectable && "text-muted-foreground"
                                )}
                              >
                                {event.label}
                              </Label>
                              {event.alreadyWithdrawn ? (
                                <p className="text-xs text-muted-foreground">棄権申請済み</p>
                              ) : event.callClosed ? (
                                <p className="text-xs text-muted-foreground">召集締切済み</p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p>
                      次の画面で内容を再確認します。送信後はこの画面から取り消せません。
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
                      次の種目について棄権申請を送信します。
                    </p>
                    <ul className="list-inside list-disc text-foreground">
                      {selectedLabels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
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
                <Button type="button" disabled={!canProceed} onClick={() => setStep(2)}>
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
