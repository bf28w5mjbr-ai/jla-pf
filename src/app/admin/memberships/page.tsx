import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import MembershipApprovalTable from '@/components/admin/MembershipApprovalTable';

export const metadata: Metadata = {
  title: 'メンバーシップ承認 | JLA PF Admin',
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
      role: { in: ['OWNER', 'ADMIN'] },
      status: 'APPROVED',
    },
    select: {
      clubId: true,
    },
  });

  const clubIds = adminMemberships.map(m => m.clubId);

  if (clubIds.length === 0) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">メンバーシップ承認</h1>
        <p className="text-muted-foreground">
          クラブの管理者権限がありません。
        </p>
      </div>
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
          firstName: true,
          lastName: true,
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
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">メンバーシップ承認</h1>
      <MembershipApprovalTable memberships={pendingMemberships} />
    </div>
  );
}
