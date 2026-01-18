import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';

export const metadata: Metadata = {
  title: 'クラブ | JLA PF',
};

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      role: true,
      memberships: {
        include: {
          club: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!user) redirect("/login");

  // オーナーとなっているクラブを取得
  const ownedClubs = user.memberships.filter(m => m.role === 'OWNER');
  
  // オーナーとなっているクラブが1つだけの場合、直接そのクラブの管理ページへリダイレクト
  if (ownedClubs.length === 1) {
    redirect(`/clubs/${ownedClubs[0].clubId}`);
  }

  // クラブオーナーかどうか
  const isClubOwner = ownedClubs.length > 0;

  // 全クラブ取得（参加可能なクラブを探すため）
  const allClubs = await prisma.club.findMany({
    where: {
      status: {
        in: ['JLA_APPROVED', 'ACTIVE']
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return (
    <PageLayout 
      title="クラブ" 
      description="所属クラブの管理と新規クラブへの参加"
      userRole={user.role}
      isClubOwner={isClubOwner}
    >
      <div className="space-y-6">
        {/* アクションボタン */}
        <div className="flex gap-3">
          <Link
            href="/clubs/create"
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            クラブを作成
          </Link>
        </div>

        {/* 所属クラブ */}
        <Card padding="none">
          <CardHeader>
            <CardTitle>所属クラブ</CardTitle>
          </CardHeader>
          <DataTable
            data={user.memberships}
            columns={[
              {
                header: "クラブ名",
                accessor: (m) => (
                  <Link href={`/clubs/${m.club.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                      {m.club.name.charAt(0)}
                    </div>
                    <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline">{m.club.name}</span>
                  </Link>
                ),
              },
              {
                header: "役割",
                accessor: (m) => (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                    m.role === 'OWNER' 
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                      : m.role === 'ADMIN'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400'
                  }`}>
                    {m.role}
                  </span>
                ),
              },
              {
                header: "ステータス",
                accessor: (m) => (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                    m.status === 'APPROVED'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : m.status === 'PENDING'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}>
                    {m.status}
                  </span>
                ),
              },
              {
                header: "参加日",
                accessor: (m) => new Date(m.createdAt).toLocaleDateString("ja-JP"),
                className: "text-gray-500 dark:text-gray-400",
              },
            ]}
            keyExtractor={(m) => m.id}
            emptyMessage="所属しているクラブがありません"
          />
        </Card>

        {/* 参加可能なクラブ */}
        <Card padding="none">
          <CardHeader>
            <CardTitle>参加可能なクラブ</CardTitle>
          </CardHeader>
          <DataTable
            data={allClubs.filter(club => 
              !user.memberships.some(m => m.clubId === club.id)
            )}
            columns={[
              {
                header: "クラブ名",
                accessor: (club) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                      {club.name.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{club.name}</span>
                  </div>
                ),
              },
              {
                header: "ステータス",
                accessor: (club) => (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                    club.status === 'ACTIVE'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                  }`}>
                    {club.status}
                  </span>
                ),
              },
              {
                header: "住所",
                accessor: (club) => club.officeAddress || "-",
                className: "text-gray-600 dark:text-gray-400",
              },
              {
                header: "",
                accessor: (club) => (
                  <Link
                    href={`/clubs/${club.id}/join`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    参加申請
                  </Link>
                ),
              },
            ]}
            keyExtractor={(club) => club.id}
            emptyMessage="参加可能なクラブがありません"
          />
        </Card>
      </div>
    </PageLayout>
  );
}
