import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const CSV_EXPORT_SCOPE = {
  INDIVIDUAL: "INDIVIDUAL",
  TEAM: "TEAM",
} as const;
export type CsvExportScope = (typeof CSV_EXPORT_SCOPE)[keyof typeof CSV_EXPORT_SCOPE];

export const CSV_EXPORT_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

/** 承認後に CSV ダウンロード可能な期間（日） */
export const CSV_EXPORT_APPROVAL_VALID_DAYS = 30;

type CsvExportDelegate = Prisma.CompetitionEntryCsvExportRequestDelegate;

/**
 * prisma generate 直後や dev の HMR で、global に載った PrismaClient が古いと
 * `competitionEntryCsvExportRequest` が undefined になることがある。
 * その場合は null を返し、呼び出し側でフォールバックする。
 */
export function getCompetitionEntryCsvExportDelegate(): CsvExportDelegate | null {
  const p = prisma as unknown as { competitionEntryCsvExportRequest?: CsvExportDelegate };
  const d = p.competitionEntryCsvExportRequest;
  if (!d) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[Prisma] competitionEntryCsvExportRequest がありません。pnpm prisma generate のあと dev サーバー（Turbopack）を再起動してください。"
      );
    }
    return null;
  }
  return d;
}

export async function getActiveCsvExportApproval(competitionId: string, scope: string) {
  const d = getCompetitionEntryCsvExportDelegate();
  if (!d) return null;
  const now = new Date();
  return d.findFirst({
    where: {
      competitionId,
      scope,
      status: CSV_EXPORT_STATUS.APPROVED,
      expiresAt: { gt: now },
    },
    orderBy: { reviewedAt: "desc" },
  });
}

export async function getPendingCsvExportRequest(competitionId: string, scope: string) {
  const d = getCompetitionEntryCsvExportDelegate();
  if (!d) return null;
  return d.findFirst({
    where: {
      competitionId,
      scope,
      status: CSV_EXPORT_STATUS.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** PF管理者向け：承認待ち一覧（デリゲートが無いときは空配列） */
export async function findManyPendingCsvExportRequestsForPfAdmin() {
  const d = getCompetitionEntryCsvExportDelegate();
  if (!d) return [];
  return d.findMany({
    where: { status: CSV_EXPORT_STATUS.PENDING },
    orderBy: { createdAt: "asc" },
    include: {
      competition: {
        select: {
          name: true,
          organization: { select: { name: true } },
        },
      },
      requestedBy: {
        select: {
          profile: { select: { familyName: true, givenName: true } },
          email: true,
        },
      },
    },
  });
}
