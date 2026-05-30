import { cache } from "react";
import { prisma } from "@/server/db";
import { withPrismaPoolRetryOnce } from "@/lib/prismaPool";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { ORG_OPERATIONAL_STATUS } from "@/lib/organizerLifecycle";

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
    const row = await withPrismaPoolRetryOnce(() =>
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: {
          name: true,
          organizationId: true,
          organization: {
            select: {
              status: true,
              admins: {
                where: { userId },
                select: { role: true },
              },
            },
          },
        },
      })
    );
    if (!row) return { kind: "not_found" };
    if (row.organizationId !== organizationId) return { kind: "wrong_org" };
    if (!hasOrgAdminAccess(row.organization.admins)) return { kind: "forbidden" };
    if (row.organization.status !== ORG_OPERATIONAL_STATUS) return { kind: "forbidden" };
    return { kind: "ok", name: row.name };
  }
);

/**
 * URL に organizationId が無い管理ページ向け（例: `/competitions/[id]/results/manage`）。
 */
export const getCompetitionManagementAccessByCompetitionId = cache(
  async (
    competitionId: string,
    userId: string
  ): Promise<CompetitionManagementAccessResult> => {
    const row = await withPrismaPoolRetryOnce(() =>
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { organizationId: true },
      })
    );
    if (!row) return { kind: "not_found" };
    return getCompetitionManagementAccess(row.organizationId, competitionId, userId);
  }
);
