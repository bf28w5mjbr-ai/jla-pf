import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";

export type DayOpsAccessContext = {
  organizationId: string;
  operatorUserId: string | null;
  isOrgAdmin: boolean;
  hasDayOpsUnlock: boolean;
};

export async function resolveDayOpsAccess(
  competitionId: string,
  request: NextRequest
): Promise<DayOpsAccessContext> {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  const operatorUserId = session?.userId ?? null;

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { organizationId: true },
  });

  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  let isOrgAdmin = false;
  if (operatorUserId) {
    const admin = await prisma.orgAdmin.findFirst({
      where: { organizationId: competition.organizationId, userId: operatorUserId },
      select: { role: true },
    });
    isOrgAdmin = admin ? isOrgAdminRole(admin.role) : false;
  }

  const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);

  return {
    organizationId: competition.organizationId,
    operatorUserId,
    isOrgAdmin,
    hasDayOpsUnlock,
  };
}

/** NFC タグ紐付けなど「主催管理者のみ」向け（クッキーアンロックでは不可） */
export async function getOrgAdminContextForCompetition(
  competitionId: string,
  userId: string
): Promise<{ organizationId: string; isOrgAdmin: boolean }> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { organizationId: true },
  });
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }
  const admin = await prisma.orgAdmin.findFirst({
    where: { organizationId: competition.organizationId, userId },
    select: { role: true },
  });
  return {
    organizationId: competition.organizationId,
    isOrgAdmin: admin ? isOrgAdminRole(admin.role) : false,
  };
}

export async function assertDayOpsReadAccess(
  competitionId: string,
  request: NextRequest
): Promise<DayOpsAccessContext> {
  const ctx = await resolveDayOpsAccess(competitionId, request);
  if (ctx.isOrgAdmin || ctx.hasDayOpsUnlock) {
    return ctx;
  }
  if (!ctx.operatorUserId) {
    throw new Error("DAY_OPS_UNAUTHORIZED");
  }
  throw new Error("DAY_OPS_FORBIDDEN");
}

export async function assertDayOpsRecorderWriteAccess(
  competitionId: string,
  request: NextRequest
): Promise<DayOpsAccessContext> {
  return assertDayOpsReadAccess(competitionId, request);
}

export async function assertDayOpsAdminWriteAccess(
  competitionId: string,
  request: NextRequest
): Promise<DayOpsAccessContext> {
  return assertDayOpsReadAccess(competitionId, request);
}

export async function assertDayOpsWriteAccess(
  competitionId: string,
  request: NextRequest
): Promise<DayOpsAccessContext> {
  return assertDayOpsRecorderWriteAccess(competitionId, request);
}
