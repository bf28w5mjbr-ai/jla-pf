"use client";

import { useState } from "react";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";
import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";

interface Props {
  amount: number;
  description: string;
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
}

/**
 * 決済確認コンポーネント（パスワード認証付き）
 * 高額決済や重要な取引の前に使用
 */
export default function PaymentConfirmation({
  amount,
  description,
  onConfirm,
  onCancel,
}: Props) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const { isModalOpen, executeProtectedAction, handleVerified, handleClose } =
    usePasswordProtectedAction();

  const handlePayment = async () => {
    setError("");
    setProcessing(true);

    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "決済に失敗しました");
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmClick = () => {
    // 高額決済の場合はパスワード確認を要求（例: 10,000円以上）
    if (amount >= 10000) {
      executeProtectedAction(handlePayment);
    } else {
      // 少額の場合は直接実行
      handlePayment();
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          決済内容の確認
        </h3>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {description}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            ¥{amount.toLocaleString()}
          </p>
        </div>

        {amount >= 10000 && (
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              🔒 セキュリティ保護: この決済を実行するには、パスワード認証が必要です
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        )}

        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={processing}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-base font-semibold py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleConfirmClick}
            disabled={processing}
            className="flex-1 bg-orange-600 text-white text-base font-semibold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "処理中..." : "決済を実行"}
          </button>
        </div>
      </div>

      <PasswordVerificationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onVerified={handleVerified}
        title="決済の本人確認"
        description={`¥${amount.toLocaleString()}の決済を実行するには、パスワードを入力してください`}
      />
    </>
  );
}
