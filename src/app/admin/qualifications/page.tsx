import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import QualificationApprovalTable from '@/components/admin/QualificationApprovalTable';

export const metadata: Metadata = {
  title: '資格承認 | JLA PF Admin',
};

export default async function AdminQualificationsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = token ? await verifySession(token) : null;

  if (!sess?.userId) {
    redirect('/login');
  }

  // PF_ADMIN 権限チェック
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });

  if (user?.role !== 'PF_ADMIN') {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">資格承認</h1>
        <p className="text-muted-foreground">
          プラットフォーム管理者権限が必要です。
        </p>
      </div>
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
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">資格承認</h1>
      <QualificationApprovalTable qualifications={pendingQualifications} />
    </div>
  );
}
