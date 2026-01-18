import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "団体一覧 | JLA PF",
  description: "大会運営団体の一覧",
};

export default async function OrganizationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  // ユーザーが所属している団体を取得
  const userOrganizations = await prisma.organization.findMany({
    where: {
      admins: {
        some: {
          userId: session.userId,
        },
      },
    },
    include: {
      admins: {
        where: {
          userId: session.userId,
        },
        select: {
          role: true,
        },
      },
      _count: {
        select: {
          admins: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // サイドバー用の団体一覧（id, name, abbreviationのみ）
  const sidebarOrganizations = userOrganizations.map(org => ({
    id: org.id,
    name: org.name,
    abbreviation: org.abbreviation,
  }));

  // 公開されている団体一覧（自分が所属していないもの）
  const publicOrganizations = await prisma.organization.findMany({
    where: {
      status: {
        in: ["APPROVED", "ACTIVE"],
      },
      NOT: {
        admins: {
          some: {
            userId: session.userId,
          },
        },
      },
    },
    include: {
      _count: {
        select: {
          admins: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
    take: 20,
  });

  return (
    <PageLayout
      title="団体一覧"
      description="大会運営団体の一覧"
      organizations={sidebarOrganizations}
      action={
        <Link href="/organizations/create">
          <Button>新しい団体を作成</Button>
        </Link>
      }
    >
      <div className="space-y-8">
        {/* 自分の団体 */}
        {userOrganizations.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">所属している団体</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userOrganizations.map((org) => (
                <Link key={org.id} href={`/organizations/${org.id}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{org.name}</CardTitle>
                          {org.nameKana && (
                            <p className="text-sm text-gray-500 mt-1">
                              {org.nameKana}
                            </p>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                            org.admins[0]?.role === "OWNER"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                              : org.admins[0]?.role === "ADMIN"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {org.admins[0]?.role}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {org.abbreviation && (
                          <p className="text-gray-600 dark:text-gray-400">
                            略称: {org.abbreviation}
                          </p>
                        )}
                        <p className="text-gray-500 dark:text-gray-500">
                          メンバー: {org._count.admins}名
                        </p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                            org.status === "ACTIVE"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : org.status === "APPROVED"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : org.status === "PENDING"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {org.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 公開団体一覧 */}
        {publicOrganizations.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">公開されている団体</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicOrganizations.map((org) => (
                <Link key={org.id} href={`/organizations/${org.id}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">{org.name}</CardTitle>
                      {org.nameKana && (
                        <p className="text-sm text-gray-500 mt-1">
                          {org.nameKana}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {org.abbreviation && (
                          <p className="text-gray-600 dark:text-gray-400">
                            略称: {org.abbreviation}
                          </p>
                        )}
                        {org.description && (
                          <p className="text-gray-600 dark:text-gray-400 line-clamp-2">
                            {org.description}
                          </p>
                        )}
                        <p className="text-gray-500 dark:text-gray-500">
                          メンバー: {org._count.admins}名
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {userOrganizations.length === 0 && publicOrganizations.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-gray-500 mb-4">
              まだ団体が登録されていません
            </p>
            <Link href="/organizations/create">
              <Button>最初の団体を作成</Button>
            </Link>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
