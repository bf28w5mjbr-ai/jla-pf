import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isPfOrAccAdmin, verifySessionCached } from '@/lib/auth';
import { prisma } from '@/server/db';
import { Card } from '@/components/ui/card';
import QualificationApprovalTable from '@/components/admin/QualificationApprovalTable';

export const metadata: Metadata = {
  title: "資格の確認 | Bluvium Admin",
};

export default async function AdminQualificationsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect('/login');
  }

  // 協会管理者（AssociationAdmin.ADMIN）/ PF_ADMIN 権限チェック
  if (!(await isPfOrAccAdmin(sess.userId))) {
    return (
      
        <Card>
          <div className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              協会管理者権限が必要です。
            </p>
          </div>
        </Card>
      
    );
  }

  // 有効以外（旧審査待ち・却下・期限切れ）。新規登録は即 APPROVED のため通常は件数少ない
  const pendingQualifications = await prisma.qualification.findMany({
    where: {
      status: { in: ["PENDING", "REJECTED", "EXPIRED"] },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          givenName: true,
          familyName: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    
      <Card padding="none">
        <QualificationApprovalTable qualifications={pendingQualifications.map(q => ({
          ...q,
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
          issueDate: q.issueDate?.toISOString() || null,
          expiryDate: q.expiryDate?.toISOString() || null,
        }))} />
      </Card>
    
  );
}
