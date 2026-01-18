import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import DashboardProfilePhoto from '@/components/DashboardProfilePhoto';

export const metadata: Metadata = {
  title: 'ダッシュボード | JLA PF',
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const userId = sess.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      phoneNumber: true,
      role: true,
      dateOfBirth: true,
      sex: true,
      postalCode: true,
      prefecture: true,
      city: true,
      addressLine1: true,
      addressLine2: true,
      jlaMemberNumber: true,
      profilePhotoUrl: true,
      createdAt: true,
      memberships: {
        include: {
          club: true
        },
        orderBy: { createdAt: "desc" }
      },
      qualifications: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!user) redirect("/login");

  // クラブオーナーかどうかを確認
  const isClubOwner = user.memberships.some(m => m.role === 'OWNER');
  
  // 所属クラブ（承認済みのみ）
  const activeClubs = user.memberships.filter(m => m.status === 'APPROVED');
  const clubNames = activeClubs.length > 0 
    ? activeClubs.map(m => m.club.name).join('、') 
    : '未所属';

  // ユーザーが所属する団体一覧を取得（サイドバー用）
  const userOrganizations = await prisma.organization.findMany({
    where: {
      admins: {
        some: {
          userId: userId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return (
    <PageLayout userRole={user.role} isClubOwner={isClubOwner} organizations={userOrganizations}>
      {/* 名刺風プロフィール */}
      <Card padding="lg" className="mb-12">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            {/* プロフィール写真またはイニシャル */}
            <DashboardProfilePhoto
              currentPhotoUrl={user.profilePhotoUrl}
              userName={`${user.familyName}${user.givenName}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <div className="flex items-baseline gap-3 mb-1">
                <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                  {user.familyName} {user.givenName}
                </h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {(() => {
                    const today = new Date();
                    const birthDate = new Date(user.dateOfBirth);
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const monthDiff = today.getMonth() - birthDate.getMonth();
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                      age--;
                    }
                    return age;
                  })()}歳
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {user.familyNameKana} {user.givenNameKana}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">所属クラブ</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{clubNames}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">ID</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono text-xs truncate">{user.id}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">電話番号</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono">{user.phoneNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">メール</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono truncate">{user.email}</span>
              </div>
              {user.jlaMemberNumber && (
                <div className="flex items-center gap-2 text-sm md:col-span-2">
                  <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">JLA会員番号</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{user.jlaMemberNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* クラブ申請ボタン */}
      <div className="mb-8">
        <Link
          href="/clubs/join"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <span>クラブに参加する</span>
          <span>→</span>
        </Link>
      </div>

      <div className="space-y-6">
        {/* 申請中のクラブ */}
        {user.memberships.filter(m => m.status === 'PENDING').length > 0 && (
          <Card padding="none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>申請中のクラブ</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400">
                  {user.memberships.filter(m => m.status === 'PENDING').length}件
                </span>
              </CardTitle>
            </CardHeader>
            <DataTable
              data={user.memberships.filter(m => m.status === 'PENDING')}
              columns={[
                {
                  header: "クラブ名",
                  accessor: (m) => m.club.name,
                  className: "font-medium text-gray-900 dark:text-gray-100",
                },
                {
                  header: "申請日",
                  accessor: (m) => new Date(m.createdAt).toLocaleDateString('ja-JP'),
                  className: "text-gray-600 dark:text-gray-400 text-sm",
                },
                {
                  header: "ステータス",
                  accessor: (m) => (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400">
                      承認待ち
                    </span>
                  ),
                },
              ]}
              keyExtractor={(m) => m.id}
              emptyMessage="申請中のクラブはありません"
            />
          </Card>
        )}

        {/* 保有資格 */}
        <Card padding="none">
          <CardHeader>
            <CardTitle>保有資格</CardTitle>
          </CardHeader>
          <DataTable
            data={user.qualifications}
            columns={[
              {
                header: "種類",
                accessor: "kind",
                className: "font-medium text-gray-900 dark:text-gray-100",
              },
              {
                header: "認定番号",
                accessor: (q) => q.certNumber || "-",
                className: "font-mono text-gray-600 dark:text-gray-400",
              },
              {
                header: "ステータス",
                accessor: (q) => (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                    q.status === 'ACTIVE' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' 
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}>
                    {q.status}
                  </span>
                ),
              },
              {
                header: "有効期限",
                accessor: (q) =>
                  q.expiryDate
                    ? new Date(q.expiryDate).toLocaleDateString("ja-JP")
                    : "-",
                className: "text-gray-500 dark:text-gray-400",
              },
            ]}
            keyExtractor={(q) => q.id}
            emptyMessage="資格情報がありません"
          />
        </Card>

        {/* 経歴（競技成績・キャリア）*/}
        <Card>
          <CardHeader>
            <CardTitle>経歴</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">競技成績・キャリア機能は準備中です</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
