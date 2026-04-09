import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import { Card } from '@/components/ui/card';
import ClubApplicationTable from '@/components/admin/ClubApplicationTable';

export const metadata: Metadata = {
  title: 'クラブ承認 | Bluvium Admin',
};

export default async function AdminClubApplicationsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = token ? await verifySession(token) : null;

  if (!sess?.userId) {
    redirect('/login');
  }

  // PF_ADMIN権限チェック
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });

  if (user?.role !== 'PF_ADMIN') {
    return (
      
        <Card>
          <div className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              プラットフォーム管理者権限が必要です。
            </p>
          </div>
        </Card>
      
    );
  }

  // APPLYING 状態のクラブ申請を取得
  const pendingApplications = await prisma.club.findMany({
    where: {
      status: 'APPLYING',
    },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          familyName: true,
          givenName: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    
      <Card padding="none">
        <ClubApplicationTable applications={pendingApplications.map(app => ({
          ...app,
          createdAt: app.createdAt.toISOString(),
        }))} />
      </Card>
    
  );
}
