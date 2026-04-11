'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type Membership = {
  id: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    givenName: string | null;
    familyName: string | null;
    phoneNumber: string | null;
  };
  club: {
    id: string;
    name: string;
  };
};

type Props = {
  memberships: Membership[];
};

export default function MembershipApprovalTable({ memberships: initialMemberships }: Props) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/memberships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '承認に失敗しました');
        return;
      }

      // リストから削除
      setMemberships(prev => prev.filter(m => m.id !== id));
      router.refresh();
    } catch (error) {
      console.error('Approve error:', error);
      alert('承認処理中にエラーが発生しました');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('本当に却下しますか？')) return;

    setProcessing(id);
    try {
      const res = await fetch(`/api/memberships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED' }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '却下に失敗しました');
        return;
      }

      // リストから削除
      setMemberships(prev => prev.filter(m => m.id !== id));
      router.refresh();
    } catch (error) {
      console.error('Reject error:', error);
      alert('却下処理中にエラーが発生しました');
    } finally {
      setProcessing(null);
    }
  };

  if (memberships.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>承認待ちのメンバーシップ</CardTitle>
          <CardDescription>現在承認待ちのメンバーシップはありません</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>承認待ちのメンバーシップ</CardTitle>
        <CardDescription>{memberships.length} 件の承認待ちがあります</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead>クラブ</TableHead>
              <TableHead>申請日</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberships.map((membership) => (
              <TableRow key={membership.id}>
                <TableCell>
                  {membership.user.familyName} {membership.user.givenName}
                </TableCell>
                <TableCell>{membership.user.email}</TableCell>
                <TableCell>{membership.user.phoneNumber || '-'}</TableCell>
                <TableCell>{membership.club.name}</TableCell>
                <TableCell>
                  {new Date(membership.createdAt).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(membership.id)}
                      disabled={processing === membership.id}
                    >
                      {processing === membership.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          承認
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(membership.id)}
                      disabled={processing === membership.id}
                    >
                      {processing === membership.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-1" />
                          却下
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
