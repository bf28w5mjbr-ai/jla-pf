import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from "@/components/ui/PageLayout";
import CreateOrganizationForm from "@/components/CreateOrganizationForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "団体作成 | JLA PF",
  description: "新しい大会運営団体を作成します",
};

export default async function CreateOrganizationPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
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
      title="新しい団体を作成"
      description="大会を運営するための団体を作成します"
      organizations={userOrganizations}
    >
      <CreateOrganizationForm />
    </PageLayout>
  );
}
