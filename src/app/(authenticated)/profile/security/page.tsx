import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySessionCached } from '@/lib/auth';
import { prisma } from '@/server/db';
import SecuritySetupForm from './SecuritySetupForm';
import PasskeyManager from './PasskeyManager';
import RecentLoginEnvironment from '@/components/profile/RecentLoginEnvironment';
import { loginEventListSelect } from '@/lib/userSecurity';

export const metadata: Metadata = {
  title: 'セキュリティ設定 | Bluvium',
};

export default async function SecurityPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      email: true,
      security: {
        select: {
          passwordHash: true,
          lastLoginAt: true,
          lastLoginIp: true,
          lastLoginUa: true,
        },
      },
      loginEvents: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: loginEventListSelect,
      },
      _count: { select: { passkeyCredentials: true } },
    },
  });

  if (!user) {
    redirect('/login');
  }

  const security = user.security;
  const hasEmail = user.email && !user.email.includes('@temp.jla.local');
  const hasPassword = !!security?.passwordHash;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">セキュリティ設定</h1>
      <p className="text-muted-foreground mb-8">
        アカウント復旧のためのメールアドレスとパスワードを設定してください
      </p>

      <SecuritySetupForm 
        currentEmail={hasEmail ? user.email : null}
        hasPassword={hasPassword}
      />

      <RecentLoginEnvironment
        lastLoginAt={security?.lastLoginAt ?? null}
        lastLoginIp={security?.lastLoginIp ?? null}
        lastLoginUa={security?.lastLoginUa ?? null}
        recentEvents={user.loginEvents}
      />

      <PasskeyManager
        promoteWhenEmpty={user._count.passkeyCredentials === 0}
      />
    </div>
  );
}
