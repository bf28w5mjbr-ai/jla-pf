import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Building2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "大会一覧 | JLA PF",
  description: "ライフセービング大会一覧",
};

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const params = await searchParams;
  const statusFilter = params.status;
  const categoryFilter = params.category;

  // 大会一覧を取得（公開中のもの、または自分が管理する団体の大会）
  const userOrgIds = await prisma.orgAdmin.findMany({
    where: { userId: session.userId },
    select: { organizationId: true },
  });

  const whereCondition: any = {
    OR: [
      { isPublished: true, status: "PUBLISHED" }, // 公開中の大会
      { organizationId: { in: userOrgIds.map((o) => o.organizationId) } }, // 自分が管理する大会
    ],
  };

  if (statusFilter && statusFilter !== "ALL") {
    whereCondition.status = statusFilter;
  }

  if (categoryFilter && categoryFilter !== "ALL") {
    whereCondition.category = categoryFilter;
  }

  const competitions = await prisma.competition.findMany({
    where: whereCondition,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { startDate: "desc" },
    take: 50,
  });

  // 今後開催される大会と過去の大会に分ける
  const now = new Date();
  const upcomingCompetitions = competitions.filter(
    (c) => new Date(c.startDate) >= now
  );
  const pastCompetitions = competitions.filter(
    (c) => new Date(c.startDate) < now
  );

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
      name: "asc",
    },
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "下書き";
      case "PUBLISHED":
        return "公開中";
      case "ONGOING":
        return "開催中";
      case "COMPLETED":
        return "終了";
      case "CANCELLED":
        return "中止";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "DRAFT":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      case "ONGOING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "COMPLETED":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "CANCELLED":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const CompetitionCard = ({ competition }: { competition: typeof competitions[0] }) => (
    <Link href={`/competitions/${competition.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {competition.name}
                </h3>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                    competition.status
                  )}`}
                >
                  {getStatusLabel(competition.status)}
                </span>
              </div>
              {competition.nameKana && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {competition.nameKana}
                </p>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(competition.startDate)}</span>
                  {competition.endDate &&
                    new Date(competition.endDate).toDateString() !==
                      new Date(competition.startDate).toDateString() && (
                      <>
                        <span>〜</span>
                        <span>{formatDate(competition.endDate)}</span>
                      </>
                    )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  <span>{competition.venue}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Building2 className="h-4 w-4" />
                  <span>
                    {competition.organization.name}
                    {competition.organization.abbreviation &&
                      ` (${competition.organization.abbreviation})`}
                  </span>
                </div>
              </div>
              {competition.category && (
                <div className="mt-3">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {competition.category}
                  </span>
                </div>
              )}
            </div>
            {competition.organization.logoUrl && (
              <div className="flex-shrink-0">
                <Image
                  src={competition.organization.logoUrl}
                  alt={competition.organization.name}
                  width={80}
                  height={80}
                  className="object-contain"
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end">
            <div className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
              詳細を見る
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <PageLayout
      organizations={userOrganizations}
      headerContent={
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  大会一覧
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  全国のライフセービング大会
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      }
    >
      <div className="space-y-8">
        {/* フィルター */}
        <Card>
          <CardHeader>
            <CardTitle>絞り込み</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  ステータス
                </label>
                <div className="flex flex-wrap gap-2">
                  <Link href="/competitions?status=ALL">
                    <Button
                      variant={!statusFilter || statusFilter === "ALL" ? "default" : "outline"}
                      size="sm"
                    >
                      すべて
                    </Button>
                  </Link>
                  <Link href="/competitions?status=PUBLISHED">
                    <Button
                      variant={statusFilter === "PUBLISHED" ? "default" : "outline"}
                      size="sm"
                    >
                      公開中
                    </Button>
                  </Link>
                  <Link href="/competitions?status=DRAFT">
                    <Button
                      variant={statusFilter === "DRAFT" ? "default" : "outline"}
                      size="sm"
                    >
                      下書き
                    </Button>
                  </Link>
                  <Link href="/competitions?status=COMPLETED">
                    <Button
                      variant={statusFilter === "COMPLETED" ? "default" : "outline"}
                      size="sm"
                    >
                      終了
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 今後の大会 */}
        {upcomingCompetitions.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              開催予定の大会 ({upcomingCompetitions.length}件)
            </h2>
            <div className="grid gap-4">
              {upcomingCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          </div>
        )}

        {/* 過去の大会 */}
        {pastCompetitions.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              過去の大会 ({pastCompetitions.length}件)
            </h2>
            <div className="grid gap-4">
              {pastCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          </div>
        )}

        {/* 大会がない場合 */}
        {competitions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                表示できる大会がありません
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
