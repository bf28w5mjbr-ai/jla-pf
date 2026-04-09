import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isPfOrAccAdmin, verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import { Card } from '@/components/ui/card';
import QualificationApprovalTable from '@/components/admin/QualificationApprovalTable';

export const metadata: Metadata = {
  title: '資格承認 | Bluvium Admin',
};

export default async function AdminQualificationsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = token ? await verifySession(token) : null;

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

  // PENDING 状態の資格を取得
  const pendingQualifications = await prisma.qualification.findMany({
    where: {
      status: 'PENDING',
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
