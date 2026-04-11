"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface LeaveClubButtonProps {
  clubId: string;
  clubName: string;
}

export default function LeaveClubButton({ clubId, clubName }: LeaveClubButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLeave = async () => {
    if (!confirm(`本当に「${clubName}」から退会しますか？この操作は取り消せません。`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/leave`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '退会に失敗しました');
      }

      toast.success(data.message || 'クラブから退会しました');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Leave club error:', error);
      toast.error(error instanceof Error ? error.message : '退会に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleLeave}
      disabled={loading}
      variant="outline"
      className="border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
    >
      {loading ? '処理中...' : 'クラブから退会'}
    </Button>
  );
}
