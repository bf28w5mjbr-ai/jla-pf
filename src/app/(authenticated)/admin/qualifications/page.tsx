import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySessionCached } from '@/lib/auth';
import {
  jlaAdminPendingFindManyArgs,
  mapJlaAdminQueueRowToTableUser,
  qualificationAdminQueueUserSelectForPf,
  resolveQualificationAccessContext,
} from '@/lib/qualificationAccess';
import { prisma } from '@/server/db';
import { Card } from '@/components/ui/card';
import QualificationApprovalTable from '@/components/admin/QualificationApprovalTable';

export const metadata: Metadata = {
  title: '資格承認 | Bluvium Admin',
};

export default async function AdminQualificationsPage() {
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect('/login');
  }

  const access = await resolveQualificationAccessContext(sess.userId);
  if (!access.isPfAdmin && !access.isJlaReviewer) {
    return (
      
        <Card>
          <div className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              他人の資格審査は、プラットフォーム管理者、または設定済みのJLA協会管理者のみ可能です。
            </p>
          </div>
        </Card>
      
    );
  }

  if (access.isPfAdmin) {
    const pendingQualifications = await prisma.qualification.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        template: {
          select: {
            name: true,
            kind: true,
          },
        },
          user: {
            select: qualificationAdminQueueUserSelectForPf,
          },
      },
      orderBy: { createdAt: 'asc' },
    });

    return (
      
        <Card padding="none">
          <QualificationApprovalTable qualifications={pendingQualifications.map((q) => ({
            ...q,
            user: {
              id: q.user.id,
              email: q.user.email,
              familyName: q.user.profile?.familyName ?? null,
              givenName: q.user.profile?.givenName ?? null,
              phoneNumber: q.user.contact?.phoneNumber ?? null,
            },
            createdAt: q.createdAt.toISOString(),
            updatedAt: q.updatedAt.toISOString(),
            issueDate: q.issueDate?.toISOString() || null,
            expiryDate: q.expiryDate?.toISOString() || null,
            template: q.template,
          }))} />
        </Card>
      
    );
  }

  const pendingQualifications = await prisma.qualification.findMany(
    jlaAdminPendingFindManyArgs(access)
  );

  return (
    
      <Card padding="none">
        <QualificationApprovalTable qualifications={pendingQualifications.map((q) => ({
          ...q,
          user: mapJlaAdminQueueRowToTableUser(q.user),
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
          issueDate: q.issueDate?.toISOString() || null,
          expiryDate: q.expiryDate?.toISOString() || null,
          template: q.template,
        }))} />
      </Card>
    
  );
}
