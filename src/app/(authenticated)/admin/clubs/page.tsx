import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import ClubApprovalActions from '@/components/ClubApprovalActions';

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: 'クラブ管理 | Bluvium',
};

export default async function AdminClubsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  
  if (!sess?.userId) redirect("/login");

  // 管理者権限チェック
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true }
  });

  if (!user || (user.role !== 'ORG_ADMIN' && user.role !== 'PF_ADMIN')) {
    redirect("/dashboard");
  }

  // 承認待ちのクラブを取得
  const clubs = await prisma.club.findMany({
    include: {
      creator: {
        select: {
          familyName: true,
          givenName: true,
          email: true,
        }
      },
      representativeUser: {
        select: {
          familyName: true,
          givenName: true,
          email: true,
        },
      },
      _count: {
        select: {
          memberships: true,
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return (
    
      <Card padding="none">
        <CardHeader>
          <CardTitle>全クラブ一覧</CardTitle>
        </CardHeader>
        <DataTable
          data={clubs}
          columns={[
            {
              header: "クラブ名",
              accessor: (c) => c.name,
              className: "font-medium text-gray-900 dark:text-gray-100",
            },
            {
              header: "代表者",
              accessor: (c) =>
                c.representativeUser
                  ? `${c.representativeUser.familyName} ${c.representativeUser.givenName}`
                  : c.representativeFamilyName && c.representativeGivenName
                    ? `${c.representativeFamilyName} ${c.representativeGivenName}`
                    : "-",
              className: "text-gray-600 dark:text-gray-400",
            },
            {
              header: "作成者",
              accessor: (c) => c.creator ? `${c.creator.familyName} ${c.creator.givenName}` : '不明',
              className: "text-gray-600 dark:text-gray-400",
            },
            {
              header: "連絡先メール",
              accessor: (c) => (
                <div className="space-y-0.5 font-mono text-sm text-gray-600 dark:text-gray-400">
                  <p>作成者: {c.creator?.email || "-"}</p>
                  <p>代表者: {c.representativeUser?.email || "-"}</p>
                </div>
              ),
            },
            {
              header: "メンバー数",
              accessor: (c) => `${c._count.memberships}名`,
              className: "text-gray-600 dark:text-gray-400",
            },
            {
              header: "ステータス",
              accessor: (c) => (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                  c.status === 'APPROVED'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                    : c.status === 'JLA_APPROVED'
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400'
                    : c.status === 'SUSPENDED'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                }`}>
                  {c.status}
                </span>
              ),
            },
            {
              header: "操作",
              accessor: (c) => (
                <ClubApprovalActions clubId={c.id} currentStatus={c.status} />
              ),
            },
          ]}
          keyExtractor={(c) => c.id}
          emptyMessage="クラブがありません"
        />
      </Card>
    
  );
}
