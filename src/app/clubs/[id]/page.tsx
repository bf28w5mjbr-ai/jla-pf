import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import ClubLogoUpload from '@/components/ClubLogoUpload';
import MemberActions from '@/components/MemberActions';
import LeaveClubButton from '@/components/LeaveClubButton';
import ClubAnnouncements from '@/components/ClubAnnouncements';
import ClubActivities from '@/components/ClubActivities';

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true }
  });
  
  return {
    title: `${club?.name || 'クラブ'} | JLA PF`,
  };
}

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  // 現在のユーザー情報を取得
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      role: true,
      memberships: {
        select: {
          role: true,
          clubId: true,
        }
      }
    }
  });

  if (!user) redirect("/login");

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          familyName: true,
          givenName: true,
        }
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              familyName: true,
              givenName: true,
              email: true,
            }
          }
        },
        orderBy: [
          { role: 'asc' },
          { createdAt: 'desc' }
        ]
      }
    }
  });

  if (!club) {
    redirect("/clubs");
  }

  // 現在のユーザーのメンバーシップを確認
  const userMembership = club.memberships.find(m => m.userId === sess.userId);
  const isOwnerOrAdmin = userMembership && (userMembership.role === 'OWNER' || userMembership.role === 'ADMIN');

  // クラブオーナーかどうかの判定
  const ownedClubs = user.memberships.filter(m => m.role === 'OWNER');
  const isClubOwner = ownedClubs.length > 0;

  return (
    <PageLayout 
      userRole={user.role}
      isClubOwner={isClubOwner}
      headerContent={
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* ロゴ */}
              <div className="flex-shrink-0">
                {isOwnerOrAdmin ? (
                  <ClubLogoUpload
                    clubId={club.id}
                    currentLogoUrl={club.logoUrl}
                    clubName={club.name}
                  />
                ) : club.logoUrl ? (
                  <div className="w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden">
                    <img src={club.logoUrl} alt={`${club.name}のロゴ`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* クラブ情報 */}
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{club.name}</h1>
                    {club.nameKana && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{club.nameKana}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    club.status === 'ACTIVE'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : club.status === 'JLA_APPROVED'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                  }`}>
                    {club.status}
                  </span>
                </div>

                {/* 名刺調の情報 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm border-t pt-4">
                  {/* 左列 */}
                  <div className="space-y-2">
                    {(club.representativeFamilyName || club.representativeGivenName) && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">代表者</span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {club.representativeFamilyName} {club.representativeGivenName}
                        </span>
                      </div>
                    )}
                    {club.representativePhone && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">代表者TEL</span>
                        <span className="text-gray-900 dark:text-gray-100">{club.representativePhone}</span>
                      </div>
                    )}
                    {club.officePhone && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">事務局TEL</span>
                        <span className="text-gray-900 dark:text-gray-100">{club.officePhone}</span>
                      </div>
                    )}
                  </div>

                  {/* 右列 */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">メンバー数</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {club.memberships.filter(m => m.status === 'APPROVED').length}名
                      </span>
                    </div>
                    {club.patrolLocation && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">監視場所</span>
                        <span className="text-gray-900 dark:text-gray-100">{club.patrolLocation}</span>
                      </div>
                    )}
                    {club.establishedYear && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">設立年</span>
                        <span className="text-gray-900 dark:text-gray-100">{club.establishedYear}年</span>
                      </div>
                    )}
                  </div>

                  {/* 住所（横幅いっぱい） */}
                  {(club.officePrefecture || club.officeCity || club.officeAddressLine1) && (
                    <div className="md:col-span-2 flex gap-2 pt-2 border-t">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">事務局</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {club.officePostalCode && `〒${club.officePostalCode} `}
                        {club.officePrefecture}
                        {club.officeCity}
                        {club.officeAddressLine1}
                        {club.officeAddressLine2}
                      </span>
                    </div>
                  )}
                </div>

                {/* アクションボタン */}
                <div className="pt-2 flex gap-3">
                  {isOwnerOrAdmin && (
                    <Link
                      href={`/clubs/${club.id}/edit`}
                      className="inline-flex items-center px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      クラブ情報を編集
                    </Link>
                  )}
                  {userMembership && userMembership.role !== 'OWNER' && (
                    <LeaveClubButton clubId={club.id} clubName={club.name} />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      }
    >
      <div className="space-y-6">
        {/* お知らせセクション */}
        {userMembership && (
          <ClubAnnouncements
            clubId={club.id}
            currentUserId={sess.userId}
            currentUserRole={userMembership.role}
          />
        )}

        {/* 活動記録セクション */}
        {userMembership && (
          <ClubActivities
            clubId={club.id}
            currentUserId={sess.userId}
            currentUserRole={userMembership.role}
          />
        )}

        {/* 参加申請一覧（オーナー/管理者のみ） */}
        {isOwnerOrAdmin && club.memberships.filter(m => m.status === 'PENDING').length > 0 && (
          <Card padding="none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>参加申請</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400">
                  {club.memberships.filter(m => m.status === 'PENDING').length}件
                </span>
              </CardTitle>
            </CardHeader>
            <DataTable
              data={club.memberships.filter(m => m.status === 'PENDING')}
              columns={[
                {
                  header: "氏名",
                  accessor: (m) => `${m.user.familyName} ${m.user.givenName}`,
                  className: "font-medium text-gray-900 dark:text-gray-100",
                },
                {
                  header: "メール",
                  accessor: (m) => m.user.email,
                  className: "text-gray-600 dark:text-gray-400 font-mono text-sm",
                },
                {
                  header: "申請日",
                  accessor: (m) => new Date(m.createdAt).toLocaleDateString('ja-JP'),
                  className: "text-gray-600 dark:text-gray-400 text-sm",
                },
                {
                  header: "操作",
                  accessor: (m) => (
                    <MemberActions
                      membershipId={m.id}
                      clubId={club.id}
                      status={m.status}
                      role={m.role}
                      currentUserId={sess.userId}
                      targetUserId={m.userId}
                      currentUserRole={userMembership?.role || 'MEMBER'}
                    />
                  ),
                },
              ]}
              keyExtractor={(m) => m.id}
              emptyMessage="申請はありません"
            />
          </Card>
        )}

        {/* メンバー一覧 */}
        <Card padding="none">
          <CardHeader>
            <CardTitle>メンバー</CardTitle>
          </CardHeader>
          <DataTable
            data={club.memberships.filter(m => m.status === 'APPROVED')}
            columns={[
              {
                header: "氏名",
                accessor: (m) => `${m.user.familyName} ${m.user.givenName}`,
                className: "font-medium text-gray-900 dark:text-gray-100",
              },
              {
                header: "メール",
                accessor: (m) => m.user.email,
                className: "text-gray-600 dark:text-gray-400 font-mono text-sm",
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
              ...(isOwnerOrAdmin ? [{
                header: "操作",
                accessor: (m: typeof club.memberships[0]) => (
                  <MemberActions
                    membershipId={m.id}
                    clubId={club.id}
                    status={m.status}
                    role={m.role}
                    currentUserId={sess.userId}
                    targetUserId={m.userId}
                    currentUserRole={userMembership?.role || 'MEMBER'}
                  />
                ),
              }] : []),
            ]}
            keyExtractor={(m) => m.id}
            emptyMessage="メンバーがいません"
          />
        </Card>
      </div>
    </PageLayout>
  );
}
