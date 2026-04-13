import { prisma } from "@/server/db";
import { CLUB_ANNUAL_REGISTRATION_ENABLED } from "@/lib/clubAnnualRegistrationPolicy";

export function isUpdateWindow(date: Date = new Date()): boolean {
  return date.getMonth() === 2; // March (0-indexed)
}

export function getCurrentFiscalYear(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? year : year - 1;
}

export function getNextFiscalYear(date: Date = new Date()): number {
  return getCurrentFiscalYear(date) + 1;
}

export async function applyScheduledClubTypeUpdates(
  clubId: string,
  date: Date = new Date()
): Promise<void> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, type: true },
  });

  if (!club) {
    return;
  }

  if (CLUB_ANNUAL_REGISTRATION_ENABLED) {
    const fiscalYear = getCurrentFiscalYear(date);
    const annualRegistration = await prisma.clubAnnualRegistration.findUnique({
      where: {
        clubId_fiscalYear: {
          clubId,
          fiscalYear,
        },
      },
      select: { status: true },
    });

    if (!annualRegistration || annualRegistration.status !== "PAID") {
      return;
    }
  }

  const approvedInitial = await prisma.clubTypeApplication.findFirst({
    where: {
      clubId,
      status: "APPROVED",
      kind: "INITIAL",
    },
    orderBy: { createdAt: "desc" },
  });

  if (approvedInitial && club.type !== approvedInitial.requestedType) {
    await prisma.club.update({
      where: { id: clubId },
      data: { type: approvedInitial.requestedType },
    });
  }
}
