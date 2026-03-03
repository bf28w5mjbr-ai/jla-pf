"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ClubApprovalActionsProps {
  clubId: string;
  currentStatus: string;
}

export default function ClubApprovalActions({ clubId, currentStatus }: ClubApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleUpdateStatus = async (newStatus: string) => {
    const confirmMessages: Record<string, string> = {
      'JLA_APPROVED': 'このクラブを承認しますか？',
      'APPROVED': 'このクラブを正式クラブにしますか？',
      'SUSPENDED': 'このクラブを停止しますか？',
      'APPLYING': 'このクラブを申請中に戻しますか？',
    };

    if (!confirm(confirmMessages[newStatus] || 'ステータスを変更しますか？')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ステータスの更新に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Update status error:', error);
      alert(error instanceof Error ? error.message : 'ステータスの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {currentStatus === 'APPLYING' && (
        <>
          <button
            onClick={() => handleUpdateStatus('JLA_APPROVED')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            承認
          </button>
          <button
            onClick={() => handleUpdateStatus('SUSPENDED')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            拒否
          </button>
        </>
      )}
      {currentStatus === 'JLA_APPROVED' && (
        <>
          <button
            onClick={() => handleUpdateStatus('APPROVED')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            正式化
          </button>
          <button
            onClick={() => handleUpdateStatus('SUSPENDED')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            停止
          </button>
        </>
      )}
      {currentStatus === 'APPROVED' && (
        <button
          onClick={() => handleUpdateStatus('SUSPENDED')}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          停止
        </button>
      )}
      {currentStatus === 'SUSPENDED' && (
        <>
          <button
            onClick={() => handleUpdateStatus('APPLYING')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            申請中に戻す
          </button>
          <button
            onClick={() => handleUpdateStatus('JLA_APPROVED')}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            承認
          </button>
        </>
      )}
    </div>
  );
}
