import { redirect } from "next/navigation";

import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import EditOrganizationForm from "@/components/EditOrganizationForm";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOrganizationPage({ params }: PageProps) {
  const { id } = await params;

  // セッション確認
  const userId = await getRequiredAuthenticatedUserId();

  // 団体取得
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      admins: {
        where: { userId: userId },
      },
    },
  });

  if (!organization) {
    redirect("/dashboard");
  }

  // 権限確認（管理者のみ編集可能）
  if (!hasOrgAdminAccess(organization.admins)) {
    redirect(`/organizations/${id}`);
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">団体情報の編集</h1>
        <p className="text-muted-foreground mt-2">{organization.name}</p>
      </div>

      <EditOrganizationForm organization={organization} />
    </div>
  );
}
