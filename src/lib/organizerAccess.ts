import { prisma } from "@/lib/prisma";
import { requireOrgAdmin } from "@/lib/accessControl";
import { hostOrgAdminCanManageCompetition } from "@/lib/roleScopes";
import { OrganizerLifecycleError, organizerLifecycleErrorStatus } from "@/lib/organizerLifecycle";

export { OrganizerLifecycleError, organizerLifecycleErrorStatus };

/**
 * 大会に紐づく主催団体で PF 代行込みの operational 検証（`/api/organizations/...` 向け）。
 * 大会 mutation には {@link requireHostOrgAdminForCompetition} を使うこと。
 */
export async function requireOrgAdminForCompetition(
  competitionId: string,
  userId: string
): Promise<{ organizationId: string }> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { organizationId: true },
  });

  if (!competition) {
    throw new OrganizerLifecycleError("COMPETITION_NOT_FOUND", "大会が見つかりません");
  }

  await requireOrgAdmin(competition.organizationId, userId, "operational");

  return { organizationId: competition.organizationId };
}

export type HostOrgAdminForCompetitionContext = {
  organizationId: string;
  organizationStatus: string;
};

/**
 * 大会の本番 mutation 向け: OrgAdmin(ADMIN) かつ主催団体 APPROVED のみ（PF_ADMIN バイパスなし）。
 */
export async function requireHostOrgAdminForCompetition(
  competitionId: string,
  userId: string
): Promise<HostOrgAdminForCompetitionContext> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
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
  });

  if (!competition) {
    throw new OrganizerLifecycleError("COMPETITION_NOT_FOUND", "大会が見つかりません");
  }

  if (
    !hostOrgAdminCanManageCompetition(
      competition.organization.admins,
      competition.organization.status
    )
  ) {
    throw new OrganizerLifecycleError(
      "ORG_ADMIN_REQUIRED",
      "大会を編集する権限がありません"
    );
  }

  return {
    organizationId: competition.organizationId,
    organizationStatus: competition.organization.status,
  };
}

export function competitionNotFoundStatus(code: string): number {
  if (code === "COMPETITION_NOT_FOUND") return 404;
  if (code === "ORG_ADMIN_REQUIRED") return 403;
  return organizerLifecycleErrorStatus(code);
}

/** API route 用: OrganizerLifecycleError を NextResponse に変換（`error` フィールド） */
export function hostOrgAdminGateJsonError(e: unknown): { status: number; error: string } | null {
  if (!(e instanceof OrganizerLifecycleError)) return null;
  return {
    status: competitionNotFoundStatus(e.code),
    error: e.message,
  };
}

/** API route 用: `message` フィールドの JSON レスポンス向け */
export function hostOrgAdminGateMessageError(e: unknown): { status: number; message: string } | null {
  if (!(e instanceof OrganizerLifecycleError)) return null;
  return {
    status: competitionNotFoundStatus(e.code),
    message: e.message,
  };
}
