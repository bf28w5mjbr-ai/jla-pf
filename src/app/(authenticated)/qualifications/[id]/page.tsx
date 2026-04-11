import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCached } from '@/lib/auth';
import { prisma } from '@/server/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { id } = await params;
  return { title: `資格詳細 | Bluvium (${id})` };
}

export default async function QualificationDetailPage({ params }: RouteParams) {
  const { id } = await params;
  const jar = await cookies();
  const token = jar.get('session')?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect('/login');
  }

  const qualification = await prisma.qualification.findUnique({
    where: { id },
  });

  if (!qualification || qualification.userId !== sess.userId) {
    redirect('/dashboard');
  }

  const expiryText = qualification.expiryDate
    ? new Date(qualification.expiryDate).toLocaleDateString('ja-JP')
    : '-';

  const issueText = qualification.issueDate
    ? new Date(qualification.issueDate).toLocaleDateString('ja-JP')
    : '-';

  return (
    
      <Card>
        <CardHeader>
          <CardTitle>{qualification.kind}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">ステータス</dt>
              <dd className="mt-1 text-gray-900 dark:text-gray-100">{qualification.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">認定番号</dt>
              <dd className="mt-1 text-gray-900 dark:text-gray-100 font-mono">{qualification.certNumber || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">発行日</dt>
              <dd className="mt-1 text-gray-900 dark:text-gray-100">{issueText}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">有効期限</dt>
              <dd className="mt-1 text-gray-900 dark:text-gray-100">{expiryText}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    
  );
}
