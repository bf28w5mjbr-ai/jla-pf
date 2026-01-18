"use client";

import { useState } from "react";

/**
 * 高リスク操作を保護するカスタムフック
 * パスワード確認が完了したら、指定されたアクションを実行します
 */
export function usePasswordProtectedAction() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  /**
   * パスワード確認付きでアクションを実行
   * @param action 実行するアクション
   */
  const executeProtectedAction = (action: () => void) => {
    setPendingAction(() => action);
    setIsModalOpen(true);
  };

  /**
   * パスワード確認成功時の処理
   */
  const handleVerified = () => {
    if (pendingAction) {
      pendingAction();
    }
    setIsModalOpen(false);
    setPendingAction(null);
  };

  /**
   * モーダルを閉じる
   */
  const handleClose = () => {
    setIsModalOpen(false);
    setPendingAction(null);
  };

  return {
    isModalOpen,
    executeProtectedAction,
    handleVerified,
    handleClose,
  };
}
