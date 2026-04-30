import { cache } from "react";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

export type CompetitionManagementAccessResult =
  | { kind: "ok"; name: string | null }
  | { kind: "not_found" }
  | { kind: "wrong_org" }
  | { kind: "forbidden" };

/**
 * 大会管理ページの generateMetadata と RSC 本体で共有し、同一リクエスト内の
 * 認可＋タイトル用の軽量 findUnique を二重に走らせない。
 */
export const getCompetitionManagementAccess = cache(
  async (
    organizationId: string,
    competitionId: string,
    userId: string
  ): Promise<CompetitionManagementAccessResult> => {
    const row = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        name: true,
        organizationId: true,
        organization: {
          select: {
            admins: {
              where: { userId },
              select: { role: true },
            },
          },
        },
      },
    });
    if (!row) return { kind: "not_found" };
    if (row.organizationId !== organizationId) return { kind: "wrong_org" };
    if (!hasOrgAdminAccess(row.organization.admins)) return { kind: "forbidden" };
    return { kind: "ok", name: row.name };
  }
);
