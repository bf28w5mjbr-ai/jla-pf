import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import EditOrganizationForm from "@/components/EditOrganizationForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOrganizationPage({ params }: PageProps) {
  const { id } = await params;

  // セッション確認
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  // 団体取得
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      admins: {
        where: { userId: session.userId },
      },
    },
  });

  if (!organization) {
    redirect("/organizations");
  }

  // 権限確認（OWNER または ADMIN のみ編集可能）
  const userRole = organization.admins[0]?.role;
  if (!userRole || (userRole !== "OWNER" && userRole !== "ADMIN")) {
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
