import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";

type PageProps = {
  searchParams: Promise<{ organizationId?: string }>;
};

export default async function CreateCompetitionPage({ searchParams }: PageProps) {
  const { organizationId } = await searchParams;

  // セッション確認
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  if (!organizationId) {
    redirect("/dashboard");
  }

  // 団体への権限を確認（管理者のみ）
  const orgAdmin = await prisma.orgAdmin.findFirst({
    where: {
      userId: session.userId,
      organizationId,
    },
    include: {
      organization: {
        select: {
          name: true,
          nameKana: true,
          abbreviation: true,
          status: true,
        },
      },
    },
  });

  if (!orgAdmin || !isOrgAdminRole(orgAdmin.role)) {
    redirect(`/organizations/${organizationId}`);
  }

  if (orgAdmin.organization.status !== "APPROVED") {
    redirect(`/organizations/${organizationId}`);
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 1);

  const competition = await prisma.competition.create({
    data: {
      organizationId,
      hostOrganizationName: orgAdmin.organization.name,
      hostOrganizationNameKana: orgAdmin.organization.nameKana,
      hostOrganizationAbbreviation: orgAdmin.organization.abbreviation,
      name: `新規大会 ${now.toLocaleDateString("ja-JP")}`,
      startDate: now,
      endDate,
      venue: "",
      status: "DRAFT",
      isPublished: false,
    },
    select: { id: true },
  });

  redirect(`/organizations/${organizationId}/competitions/${competition.id}`);
}
