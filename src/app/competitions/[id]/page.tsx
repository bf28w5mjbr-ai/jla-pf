import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, Coins } from "lucide-react";
import Image from "next/image";
import CompetitionRelationsEditor from "@/components/CompetitionRelationsEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${competition?.name || "大会"} | JLA PF`,
  };
}

export default async function CompetitionDetailPage({
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

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
          },
        },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  // 公開されていない大会は表示しない
  if (competition.status === "DRAFT") {
    notFound();
  }

  // 現在のユーザーが団体の管理者かどうか
  const userRole = competition.organization.admins[0]?.role;
  const canEdit = userRole === "OWNER" || userRole === "ADMIN";

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

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DRAFT": return "下書き";
      case "PUBLISHED": return "公開中";
      case "ONGOING": return "開催中";
      case "COMPLETED": return "終了";
      case "CANCELLED": return "中止";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PUBLISHED": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "DRAFT": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      case "ONGOING": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "COMPLETED": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "CANCELLED": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <PageLayout
      organizations={userOrganizations}
      headerContent={
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {competition.name}
                  </h1>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(competition.status)}`}>
                    {getStatusLabel(competition.status)}
                  </span>
                </div>
                {competition.nameKana && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{competition.nameKana}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      }
    >
      <div className="space-y-6">
        {/* 主催団体 */}
        <Card>
          <CardContent className="pt-6">
            <Link
              href={`/organizations/${competition.organization.id}`}
              className="flex items-center gap-4 hover:opacity-80 transition"
            >
              {competition.organization.logoUrl && (
                <div className="relative w-16 h-16 border rounded overflow-hidden bg-gray-50">
                  <Image
                    src={competition.organization.logoUrl}
                    alt={competition.organization.name}
                    fill
                    className="object-contain"
                  />
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">主催</p>
                <p className="font-semibold text-lg">
                  {competition.organization.name}
                  {competition.organization.abbreviation && (
                    <span className="text-sm text-gray-500 ml-2">
                      ({competition.organization.abbreviation})
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* 開催情報 */}
        <Card>
          <CardHeader>
            <CardTitle>開催情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">開催期間</p>
                  <p className="font-medium">
                    {formatDate(competition.startDate)}
                    <br />〜 {formatDate(competition.endDate)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">開催場所</p>
                  <p className="font-medium">{competition.venue}</p>
                  {competition.venueAddress && (
                    <p className="text-sm text-gray-600 mt-1">
                      {competition.venueAddress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 参加情報 */}
        {(competition.entryStartDate ||
          competition.maxParticipants ||
          competition.entryFee !== null) && (
          <Card>
            <CardHeader>
              <CardTitle>参加情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {competition.entryStartDate && competition.entryEndDate && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">エントリー期間</p>
                      <p className="font-medium">
                        {formatDateTime(competition.entryStartDate)}
                        <br />〜 {formatDateTime(competition.entryEndDate)}
                      </p>
                    </div>
                  </div>
                )}

                {competition.maxParticipants && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">最大参加者数</p>
                      <p className="font-medium">
                        {competition.maxParticipants.toLocaleString()}名
                      </p>
                    </div>
                  </div>
                )}

                {competition.entryFee !== null && (
                  <div className="flex items-start gap-3">
                    <Coins className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">参加費</p>
                      <p className="font-medium text-lg">
                        ¥{competition.entryFee.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 大会説明 */}
        {competition.description && (
          <Card>
            <CardHeader>
              <CardTitle>大会について</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{competition.description}</p>
            </CardContent>
          </Card>
        )}

        {/* 関係組織情報 */}
        <CompetitionRelationsEditor
          competitionId={competition.id}
          sponsors={competition.sponsors}
          cooperators={competition.cooperators}
          cooperatorsLogos={competition.cooperatorsLogos as any}
          supporters={competition.supporters}
          grants={competition.grants}
          grantsLogos={competition.grantsLogos as any}
          canEdit={false}
        />
      </div>
    </PageLayout>
  );
}
