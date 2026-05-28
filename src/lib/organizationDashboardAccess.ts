import { prisma } from "@/lib/prisma";

/**
 * 主催団体ダッシュボード（/organizations/[id]）の閲覧可否。
 * OrgAdmin（ADMIN）であれば閲覧可。
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
