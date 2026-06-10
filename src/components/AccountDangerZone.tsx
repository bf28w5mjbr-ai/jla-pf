"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";
import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AccountDangerZone() {
  const router = useRouter();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");
  const { isModalOpen, executeProtectedAction, handleVerified, handleClose } =
    usePasswordProtectedAction();

  const handleDeleteAccount = async () => {
    setError("");
    setDeleteLoading(true);

    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "アカウント削除に失敗しました");
        return;
      }

      router.push("/login?deleted=true");
    } catch {
      setError("エラーが発生しました");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteClick = () => {
    if (
      !confirm(
        "本当にアカウントを削除しますか？\n\nこの操作は取り消すことができません。\nすべてのデータが削除されます。"
      )
    ) {
      return;
    }

    executeProtectedAction(handleDeleteAccount);
  };

  return (
    <>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-destructive/80">
          Danger
        </p>
        <h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-destructive sm:text-2xl">
          危険な操作
        </h2>
        <p className="mt-1 text-sm text-destructive/85 dark:text-destructive/75">
          取り消しできない処理です。内容をよく確認してください。
        </p>
      </div>

      <div
        className={cn(
          "relative mt-6 overflow-hidden rounded-2xl border border-destructive/35 bg-destructive/5 px-5 py-5 sm:px-6 sm:py-6 dark:bg-destructive/10",
          "transition-[border-color,background-color] duration-200 hover:border-destructive/50 hover:bg-destructive/8"
        )}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-destructive/8"
          aria-hidden
        />
        <div
          className="absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b from-destructive/70 via-destructive/35 to-transparent sm:bottom-6 sm:top-6"
          aria-hidden
        />

        <div className="relative space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-destructive/95 dark:text-destructive/85">
              アカウントを削除すると、すべてのデータが完全に削除され、復元できません。
            </p>
          </div>

          {error ? (
            <div
              className="rounded-lg border border-destructive/40 bg-background px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="button"
            variant="destructive"
            onClick={handleDeleteClick}
            disabled={deleteLoading}
            className="w-full sm:w-auto"
          >
            {deleteLoading ? "削除中..." : "アカウントを削除"}
          </Button>
        </div>
      </div>

      <PasswordVerificationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onVerified={handleVerified}
        title="アカウント削除の確認"
        description="アカウントを削除するには、パスワードを入力してください"
      />
    </>
  );
}
