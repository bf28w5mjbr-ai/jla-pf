"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
          <Button
            onClick={() => handleUpdateStatus('JLA_APPROVED')}
            disabled={loading}
            size="sm"
            className="h-8 bg-orange-600 text-xs text-white hover:bg-orange-700"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            承認
          </Button>
          <Button
            onClick={() => handleUpdateStatus('SUSPENDED')}
            disabled={loading}
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            拒否
          </Button>
        </>
      )}
      {currentStatus === 'JLA_APPROVED' && (
        <>
          <Button
            onClick={() => handleUpdateStatus('APPROVED')}
            disabled={loading}
            size="sm"
            className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            正式化
          </Button>
          <Button
            onClick={() => handleUpdateStatus('SUSPENDED')}
            disabled={loading}
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            停止
          </Button>
        </>
      )}
      {currentStatus === 'APPROVED' && (
        <Button
          onClick={() => handleUpdateStatus('SUSPENDED')}
          disabled={loading}
          size="sm"
          variant="destructive"
          className="h-8 text-xs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          停止
        </Button>
      )}
      {currentStatus === 'SUSPENDED' && (
        <>
          <Button
            onClick={() => handleUpdateStatus('APPLYING')}
            disabled={loading}
            size="sm"
            className="h-8 bg-yellow-600 text-xs text-white hover:bg-yellow-700"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            申請中に戻す
          </Button>
          <Button
            onClick={() => handleUpdateStatus('JLA_APPROVED')}
            disabled={loading}
            size="sm"
            className="h-8 bg-orange-600 text-xs text-white hover:bg-orange-700"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            承認
          </Button>
        </>
      )}
    </div>
  );
}
