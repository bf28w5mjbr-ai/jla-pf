import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import { Card } from '@/components/ui/card';
import MembershipApprovalTable from '@/components/admin/MembershipApprovalTable';

export const metadata: Metadata = {
  title: 'メンバーシップ承認 | Bluvium Admin',
};

export default async function AdminMembershipsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = token ? await verifySession(token) : null;

  if (!sess?.userId) {
    redirect('/login');
  }

  // クラブ管理者権限チェック
  const adminMemberships = await prisma.membership.findMany({
    where: {
      userId: sess.userId,
      role: 'ADMIN',
      status: 'APPROVED',
    },
    select: {
      clubId: true,
    },
  });

  const clubIds = adminMemberships.map(m => m.clubId);

  if (clubIds.length === 0) {
    return (
      
        <Card>
          <div className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              クラブの管理者権限がありません。
            </p>
          </div>
        </Card>
      
    );
  }

  // PENDING 状態のメンバーシップを取得
  const pendingMemberships = await prisma.membership.findMany({
    where: {
      clubId: { in: clubIds },
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
      club: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    
      <Card padding="none">
        <MembershipApprovalTable memberships={pendingMemberships.map(m => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))} />
      </Card>
    
  );
}
