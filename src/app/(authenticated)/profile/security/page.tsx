import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/server/db';
import SecuritySetupForm from './SecuritySetupForm';
import PasskeyManager from './PasskeyManager';
import RecentLoginEnvironment from '@/components/profile/RecentLoginEnvironment';

export const metadata: Metadata = {
  title: 'セキュリティ設定 | Bluvium',
};

export default async function SecurityPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = token ? await verifySession(token) : null;

  if (!sess?.userId) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      phoneNumber: true,
      lastLoginAt: true,
      lastLoginIp: true,
      lastLoginUa: true,
      _count: { select: { passkeyCredentials: true } },
    },
  });

  if (!user) {
    redirect('/login');
  }

  const hasEmail = user.email && !user.email.includes('@temp.jla.local');
  const hasPassword = !!user.passwordHash;

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
        lastLoginAt={user.lastLoginAt}
        lastLoginIp={user.lastLoginIp}
        lastLoginUa={user.lastLoginUa}
      />

      <PasskeyManager
        promoteWhenEmpty={user._count.passkeyCredentials === 0}
      />
    </div>
  );
}
