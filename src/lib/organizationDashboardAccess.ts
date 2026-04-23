import { prisma } from "@/lib/prisma";
import { isOrgAdminRole } from "@/lib/roleScopes";

/**
 * 大会主催者ダッシュボード（/organizations/[id]）の閲覧可否。
 * 本体ページと同じく、団体内ロールが ADMIN の主催者のみ。
 */
export async function canViewOrganizationDashboardPage(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const row = await prisma.orgAdmin.findFirst({
    where: { organizationId, userId },
    select: { role: true },
  });
  return !!row && isOrgAdminRole(row.role);
}
