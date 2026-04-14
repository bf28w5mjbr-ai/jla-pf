"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function LeaveClubButton(props: { clubId: string; clubName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLeave = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/clubs/${props.clubId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "クラブからの退出に失敗しました");
      }

      toast.success(data.message || `${props.clubName} から退出しました`);
      setOpen(false);
      router.push("/profile/clubs");
      router.refresh();
    } catch (error) {
      console.error("Leave club failed:", error);
      toast.error(error instanceof Error ? error.message : "クラブからの退出に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
          クラブから退出
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>本当にクラブから退出しますか？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <strong>{props.clubName}</strong> から退出します。
              </p>
              <p>
                最後の管理者である場合や、未払い会費がある場合は退出できません。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              if (!isSubmitting) {
                void handleLeave();
              }
            }}
            disabled={isSubmitting}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isSubmitting ? "退出中..." : "退出する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
