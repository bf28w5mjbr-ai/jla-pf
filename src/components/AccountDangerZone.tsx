"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";
import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card className="overflow-hidden border-destructive/35 bg-destructive/5 shadow-sm dark:bg-destructive/10">
        <CardHeader className="space-y-1 border-b border-destructive/20 pb-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg text-destructive">危険な操作</CardTitle>
          </div>
          <CardDescription className="text-destructive/90 dark:text-destructive/80">
            取り消しできない処理です。内容をよく確認してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <p className="text-sm leading-relaxed text-destructive/95 dark:text-destructive/85">
            アカウントを削除すると、すべてのデータが完全に削除され、復元できません。
          </p>

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
        </CardContent>
      </Card>

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
