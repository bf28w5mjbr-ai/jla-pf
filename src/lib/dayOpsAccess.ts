import { isOrgAdminRole } from "@/lib/roleScopes";
import { prisma } from "@/server/db";

export type DayOpsAccess = {
  organizationId: string;
  isOrgAdmin: boolean;
  isRecorder: boolean;
};

export async function getDayOpsAccess(
  competitionId: string,
  userId: string
): Promise<DayOpsAccess> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
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

  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  const isOrgAdmin = competition.organization.admins.some((admin) =>
    isOrgAdminRole(admin.role)
  );
  const recorderAssignment = await prisma.competitionRecorderAssignment.findFirst({
    where: {
      competitionId,
      userId,
      isActive: true,
    },
    select: { id: true },
  });
  const isRecorder = Boolean(recorderAssignment);

  return {
    organizationId: competition.organizationId,
    isOrgAdmin,
    isRecorder,
  };
}

export async function assertDayOpsReadAccess(
  competitionId: string,
  userId: string
): Promise<DayOpsAccess> {
  const access = await getDayOpsAccess(competitionId, userId);
  if (!access.isOrgAdmin && !access.isRecorder) {
    throw new Error("DAY_OPS_FORBIDDEN");
  }
  return access;
}

export async function assertDayOpsRecorderWriteAccess(
  competitionId: string,
  userId: string
): Promise<DayOpsAccess> {
  return assertDayOpsReadAccess(competitionId, userId);
}

export async function assertDayOpsAdminWriteAccess(
  competitionId: string,
  userId: string
): Promise<DayOpsAccess> {
  const access = await getDayOpsAccess(competitionId, userId);
  if (!access.isOrgAdmin) {
    throw new Error("DAY_OPS_FORBIDDEN");
  }
  return access;
}

export async function assertDayOpsWriteAccess(
  competitionId: string,
  userId: string
): Promise<DayOpsAccess> {
  return assertDayOpsRecorderWriteAccess(competitionId, userId);
}
