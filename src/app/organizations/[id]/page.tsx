import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MemberManagementWrapper from "@/components/MemberManagementWrapper";
import OrganizationLogoManager from "@/components/OrganizationLogoManager";
import CompetitionListItem from "@/components/CompetitionListItem";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${org?.name || "団体"} | JLA PF`,
  };
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      admins: {
        include: {
          user: {
            select: {
              id: true,
              familyName: true,
              givenName: true,
              email: true,
            },
          },
        },
        orderBy: [
          { role: "asc" }, // OWNER, ADMIN, MEMBER の順
          { createdAt: "asc" },
        ],
      },
      createdBy: {
        select: {
          familyName: true,
          givenName: true,
        },
      },
    },
  });

  // 大会一覧を取得
  const competitions = await prisma.competition.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (!organization) {
    notFound();
  }

  // 現在のユーザーの役割を取得
  const userRole = organization.admins.find(
    (admin) => admin.userId === session.userId
  )?.role;

  const isOwnerOrAdmin = userRole === "OWNER" || userRole === "ADMIN";

  // ユーザーが所属する団体一覧を取得（サイドバー用）
  const userOrganizations = await prisma.organization.findMany({
    where: {
      admins: {
        some: {
          userId: session.userId,
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
    <PageLayout
      userRole={userRole}
      organizations={userOrganizations}
      headerContent={
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* ロゴ */}
              <div className="flex-shrink-0">
                {isOwnerOrAdmin ? (
                  <OrganizationLogoManager
                    organizationId={organization.id}
                    currentLogoUrl={organization.logoUrl}
                    organizationName={organization.name}
                    canEdit={true}
                  />
                ) : organization.logoUrl ? (
                  <div className="w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden">
                    <Image src={organization.logoUrl} alt={`${organization.name}のロゴ`} width={128} height={128} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 団体情報 */}
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{organization.name}</h1>
                    {organization.nameKana && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{organization.nameKana}</p>
                    )}
                    {organization.abbreviation && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">({organization.abbreviation})</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      organization.status === 'ACTIVE'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                        : organization.status === 'APPROVED'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                        : organization.status === 'PENDING'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400'
                    }`}>
                      {organization.status}
                    </span>
                    {isOwnerOrAdmin && (
                      <Link href={`/organizations/${organization.id}/edit`}>
                        <Button variant="outline" size="sm">編集</Button>
                      </Link>
                    )}
                  </div>
                </div>

                {/* コンパクトな情報表示 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm border-t pt-3">
                  {/* 左列 */}
                  <div className="space-y-1.5">
                    {(organization.representativeFamilyName || organization.representativeGivenName) && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">代表者</span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {organization.representativeFamilyName} {organization.representativeGivenName}
                        </span>
                      </div>
                    )}
                    {organization.email && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">メール</span>
                        <a href={`mailto:${organization.email}`} className="text-blue-600 hover:underline">{organization.email}</a>
                      </div>
                    )}
                    {organization.phoneNumber && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">電話</span>
                        <span className="text-gray-900 dark:text-gray-100">{organization.phoneNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* 右列 */}
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">メンバー数</span>
                      <span className="text-gray-900 dark:text-gray-100">{organization.admins.length}名</span>
                    </div>
                    {organization.establishedYear && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">設立年</span>
                        <span className="text-gray-900 dark:text-gray-100">{organization.establishedYear}年</span>
                      </div>
                    )}
                    {organization.websiteUrl && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">ウェブ</span>
                        <a href={organization.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                          {organization.websiteUrl.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* 住所（横幅いっぱい） */}
                  {(organization.prefecture || organization.city) && (
                    <div className="md:col-span-2 flex gap-2 pt-1.5 border-t">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">事務局</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {organization.postalCode && `〒${organization.postalCode} `}
                        {organization.prefecture}
                        {organization.city}
                        {organization.addressLine1}
                        {organization.addressLine2 && ` ${organization.addressLine2}`}
                      </span>
                    </div>
                  )}

                  {/* 説明（横幅いっぱい） */}
                  {organization.description && (
                    <div className="md:col-span-2 flex gap-2 pt-1.5 border-t">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">説明</span>
                      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap text-sm">{organization.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      }
    >
      <div className="space-y-6">
        <Tabs defaultValue="competitions" className="w-full">
          <TabsList>
            <TabsTrigger value="competitions">大会管理</TabsTrigger>
            <TabsTrigger value="members">メンバー</TabsTrigger>
            {organization.annualFee && <TabsTrigger value="fee">年会費</TabsTrigger>}
          </TabsList>

          {/* 大会管理タブ */}
          <TabsContent value="competitions" className="space-y-6">
            {isOwnerOrAdmin && (
              <div className="flex justify-end">
                <Link href={`/organizations/${organization.id}/competitions/create`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    大会を作成
                  </Button>
                </Link>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>大会一覧 ({competitions.length}件)</CardTitle>
              </CardHeader>
              <CardContent>
                {competitions.length > 0 ? (
                  <div className="space-y-3">
                    {competitions.map((competition) => (
                      <CompetitionListItem
                        key={competition.id}
                        competition={competition}
                        organizationId={organization.id}
                        canEdit={isOwnerOrAdmin}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    まだ大会が作成されていません
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* メンバータブ */}
          <TabsContent value="members" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>メンバー ({organization.admins.length}名)</CardTitle>
              </CardHeader>
              <CardContent>
                <MemberManagementWrapper
                  organizationId={organization.id}
                  members={organization.admins}
                  userRole={userRole}
                  currentUserId={session.userId}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 年会費タブ */}
          {organization.annualFee && (
            <TabsContent value="fee" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>年会費情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[100px]">年会費</span>
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">
                        {organization.annualFee.toLocaleString()}円
                      </span>
                    </div>
                    {organization.annualFeeDescription && (
                      <div className="md:col-span-2 flex gap-2 pt-2 border-t">
                        <span className="text-gray-500 dark:text-gray-400 min-w-[100px]">説明</span>
                        <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap text-sm">
                          {organization.annualFeeDescription}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PageLayout>
  );
}
