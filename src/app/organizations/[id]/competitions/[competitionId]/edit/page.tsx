import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import EditCompetitionForm from "@/components/EditCompetitionForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}): Promise<Metadata> {
  const { competitionId } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { name: true },
  });

  return {
    title: `${competition?.name || "大会"}を編集 | JLA PF`,
  };
}

export default async function EditCompetitionPage({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}) {
  const { id: organizationId, competitionId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
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

  // 大会が指定された団体に属していることを確認
  if (competition.organizationId !== organizationId) {
    notFound();
  }

  // 現在のユーザーが団体の管理者かどうか
  const userRole = competition.organization.admins[0]?.role;
  const canEdit = userRole === "OWNER" || userRole === "ADMIN";

  if (!canEdit) {
    redirect(`/organizations/${organizationId}/competitions/${competitionId}`);
  }

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
      title={`${competition.name}を編集`}
      description="大会の基本情報を編集します"
      organizations={userOrganizations}
    >
      <EditCompetitionForm 
        competition={competition}
        organizationId={organizationId}
      />
    </PageLayout>
  );
}
