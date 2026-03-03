'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ClubApplication = {
  id: string;
  name: string;
  establishedYear: number | null;
  patrolLocation: string | null;
  officePostalCode: string | null;
  officePrefecture: string | null;
  officeCity: string | null;
  officeAddressLine1: string | null;
  officePhone: string | null;
  mailingName: string | null;
  status: string;
  createdAt: string;
  creator: {
    id: string;
    email: string;
    familyName: string | null;
    givenName: string | null;
    phoneNumber: string | null;
  } | null;
};

type Props = {
  applications: ClubApplication[];
};

export default function ClubApplicationTable({ applications: initialApplications }: Props) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ClubApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = async (id: string) => {
    if (!confirm('このクラブ申請を承認しますか？')) {
      return;
    }

    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/club-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'JLA_APPROVED' }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '承認に失敗しました');
        return;
      }

      // リストから削除
      setApplications(prev => prev.filter(app => app.id !== id));
      router.refresh();
    } catch (error) {
      console.error('Approve error:', error);
      alert('承認処理中にエラーが発生しました');
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectClick = (application: ClubApplication) => {
    setSelectedApplication(application);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedApplication) return;

    if (!rejectionReason.trim()) {
      alert('却下理由を入力してください');
      return;
    }

    setProcessing(selectedApplication.id);
    try {
      const res = await fetch(`/api/admin/club-applications/${selectedApplication.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '却下に失敗しました');
        return;
      }

      // リストから削除
      setApplications(prev => prev.filter(app => app.id !== selectedApplication.id));
      setRejectDialogOpen(false);
      setSelectedApplication(null);
      router.refresh();
    } catch (error) {
      console.error('Reject error:', error);
      alert('却下処理中にエラーが発生しました');
    } finally {
      setProcessing(null);
    }
  };

  if (applications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            承認待ちのクラブ申請
          </CardTitle>
          <CardDescription>現在承認待ちのクラブ申請はありません</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            承認待ちのクラブ申請
          </CardTitle>
          <CardDescription>{applications.length} 件の承認待ちがあります</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>クラブ名</TableHead>
                <TableHead>住所</TableHead>
                <TableHead>申請者</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>電話番号</TableHead>
                <TableHead>申請日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="font-medium">{application.name}</TableCell>
                  <TableCell>
                    {[
                      application.officePrefecture,
                      application.officeCity,
                      application.officeAddressLine1,
                    ].filter(Boolean).join(' ') || '-'}
                  </TableCell>
                  <TableCell>
                    {application.creator?.familyName ?? ''} {application.creator?.givenName ?? ''}
                  </TableCell>
                  <TableCell className="text-sm">{application.creator?.email ?? '-'}</TableCell>
                  <TableCell>{application.creator?.phoneNumber || '-'}</TableCell>
                  <TableCell>
                    {new Date(application.createdAt).toLocaleDateString('ja-JP')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleApprove(application.id)}
                        disabled={processing !== null}
                      >
                        {processing === application.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        <span className="ml-1">承認</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectClick(application)}
                        disabled={processing !== null}
                      >
                        {processing === application.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="ml-1">却下</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>クラブ申請を却下</DialogTitle>
            <DialogDescription>
              却下理由を入力してください。申請者に通知されます。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rejectionReason">却下理由</Label>
              <Input
                id="rejectionReason"
                placeholder="例：申請内容に不備があります"
                value={rejectionReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectionReason(e.target.value)}
              />
            </div>
            {selectedApplication && (
              <div className="text-sm text-muted-foreground">
                <p><strong>クラブ名:</strong> {selectedApplication.name}</p>
                <p><strong>申請者:</strong> {selectedApplication.creator?.familyName} {selectedApplication.creator?.givenName}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              キャンセル
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={processing !== null || !rejectionReason.trim()}
            >
              {processing === selectedApplication?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              却下する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
