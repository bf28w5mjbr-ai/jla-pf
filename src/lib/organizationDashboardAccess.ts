import { prisma } from "@/lib/prisma";

/**
 * 主催団体ダッシュボード（/organizations/[id]）の閲覧可否。
 * OrgAdmin（ADMIN / MEMBER）であれば閲覧可。編集操作は ADMIN のみ。
 */
export async function canViewOrganizationDashboardPage(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const row = await prisma.orgAdmin.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  });
  return !!row;
}
