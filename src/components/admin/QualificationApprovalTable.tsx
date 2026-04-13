'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type Qualification = {
  id: string;
  kind: string;
  certNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    givenName: string | null;
    familyName: string | null;
    phoneNumber: string | null;
  };
};

type Props = {
  qualifications: Qualification[];
};

export default function QualificationApprovalTable({ qualifications: initialQualifications }: Props) {
  const router = useRouter();
  const [qualifications, setQualifications] = useState(initialQualifications);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/qualifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "有効化に失敗しました");
        return;
      }

      // リストから削除
      setQualifications(prev => prev.filter(q => q.id !== id));
      router.refresh();
    } catch (error) {
      console.error('Approve error:', error);
      alert("有効化処理中にエラーが発生しました");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('却下理由を入力してください（任意）');
    if (reason === null) return; // キャンセル

    setProcessing(id);
    try {
      const res = await fetch(`/api/qualifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'REJECTED',
          rejectionReason: reason || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '却下に失敗しました');
        return;
      }

      // リストから削除
      setQualifications(prev => prev.filter(q => q.id !== id));
      router.refresh();
    } catch (error) {
      console.error('Reject error:', error);
      alert('却下処理中にエラーが発生しました');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ja-JP');
  };

  if (qualifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>資格レコードの確認</CardTitle>
          <CardDescription>
            新規の保有資格は承認なしで有効になります。審査待ち・却下・期限切れのレコードはありません。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>資格レコードの確認</CardTitle>
        <CardDescription>
          {qualifications.length}{" "}
          件（審査待ち・却下・期限切れ）。必要に応じて有効化または却下してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>資格種類</TableHead>
              <TableHead>認定番号</TableHead>
              <TableHead>発行日</TableHead>
              <TableHead>有効期限</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qualifications.map((qual) => (
              <TableRow key={qual.id}>
                <TableCell>
                  {qual.user.familyName} {qual.user.givenName}
                </TableCell>
                <TableCell>{qual.user.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{qual.kind}</Badge>
                </TableCell>
                <TableCell>{qual.certNumber || '-'}</TableCell>
                <TableCell>{formatDate(qual.issueDate)}</TableCell>
                <TableCell>{formatDate(qual.expiryDate)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {qual.status === "PENDING"
                      ? "審査待ち"
                      : qual.status === "REJECTED"
                        ? "却下"
                        : qual.status === "EXPIRED"
                          ? "期限切れ"
                          : qual.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(qual.createdAt).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(qual.id)}
                      disabled={processing === qual.id}
                    >
                      {processing === qual.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          有効化
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(qual.id)}
                      disabled={processing === qual.id || qual.status !== "PENDING"}
                    >
                      {processing === qual.id ? (
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
