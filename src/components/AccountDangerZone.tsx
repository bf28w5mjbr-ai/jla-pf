"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";
import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";

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

      // 削除成功 - ログインページへ
      router.push("/login?deleted=true");
    } catch (err) {
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

    // パスワード確認モーダルを表示
    executeProtectedAction(handleDeleteAccount);
  };

  return (
    <>
      <div className="bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">
          ⚠️ 危険な操作
        </h3>
        <p className="text-sm text-red-800 dark:text-red-200 mb-4">
          アカウントを削除すると、すべてのデータが完全に削除され、復元できません。
        </p>

        {error && (
          <div className="bg-white dark:bg-gray-900 border border-red-300 dark:border-red-700 rounded-lg p-3 mb-4 text-sm text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        )}

        <button
          onClick={handleDeleteClick}
          disabled={deleteLoading}
          className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deleteLoading ? "削除中..." : "アカウントを削除"}
        </button>
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
