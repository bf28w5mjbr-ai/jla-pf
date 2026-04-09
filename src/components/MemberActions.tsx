"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isClubAdminRole } from '@/lib/roleScopes';

interface MemberActionsProps {
  membershipId: string;
  clubId: string;
  status: string;
  role: string;
  currentUserId: string;
  targetUserId: string;
  currentUserRole: string; // 現在のユーザーの役割
}

export default function MemberActions({
  membershipId,
  clubId,
  status,
  role,
  currentUserId,
  targetUserId,
  currentUserRole,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 自分自身には操作できない
  if (currentUserId === targetUserId) {
    return <span className="text-xs text-gray-400">-</span>;
  }

  // 管理者のみが役割を変更できる
  const isAdmin = isClubAdminRole(currentUserRole);

  const handleApprove = async () => {
    if (!confirm('このメンバーを承認しますか？')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/approve`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '承認に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Approve error:', error);
      alert(error instanceof Error ? error.message : '承認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('このメンバーを拒否しますか？')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/reject`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '拒否に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Reject error:', error);
      alert(error instanceof Error ? error.message : '拒否に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('このメンバーを削除しますか？この操作は取り消せません。')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '削除に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Remove error:', error);
      alert(error instanceof Error ? error.message : '削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!confirm('このメンバーを管理者に昇格しますか？')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '役割の変更に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Promote error:', error);
      alert(error instanceof Error ? error.message : '役割の変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoteToMember = async () => {
    if (!confirm('この管理者を一般メンバーに降格しますか？')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'MEMBER' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '役割の変更に失敗しました');
      }

      router.refresh();
    } catch (error) {
      console.error('Demote error:', error);
      alert(error instanceof Error ? error.message : '役割の変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      {status === 'PENDING' && (
        <>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            承認
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            拒否
          </button>
        </>
      )}
      {status === 'APPROVED' && (
        <>
          {isAdmin && role === 'MEMBER' && (
            <button
              onClick={handlePromoteToAdmin}
              disabled={loading}
              className="text-xs px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              管理者に昇格
            </button>
          )}
          {isAdmin && role === 'ADMIN' && (
            <button
              onClick={handleDemoteToMember}
              disabled={loading}
              className="text-xs px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              メンバーに降格
            </button>
          )}
          <button
            onClick={handleRemove}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            削除
          </button>
        </>
      )}
      {status === 'REJECTED' && (
        <span className="text-xs text-gray-400">-</span>
      )}
    </div>
  );
}
