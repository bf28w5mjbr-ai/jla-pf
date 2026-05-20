import { prisma } from "@/lib/prisma";

export type ClubDeleteBlockReason =
  | "PENDING_TYPE_APPLICATION"
  | "UNPAID_DUES"
  | "ACTIVE_COMPETITION_ENTRIES";

export async function getClubDeleteBlockers(
  clubId: string
): Promise<ClubDeleteBlockReason[]> {
  const blockers: ClubDeleteBlockReason[] = [];

  const [pendingTypeApp, unpaidDues, activeIndividual, activeTeam] =
    await Promise.all([
      prisma.clubTypeApplication.findFirst({
        where: { clubId, status: "PENDING" },
        select: { id: true },
      }),
      prisma.clubDues.findFirst({
        where: { clubId, status: "UNPAID" },
        select: { id: true },
      }),
      prisma.competitionEntry.findFirst({
        where: {
          clubId,
          status: { not: "CANCELLED" },
          competition: {
            status: { in: ["PUBLISHED", "ONGOING"] },
          },
        },
        select: { id: true },
      }),
      prisma.teamEntry.findFirst({
        where: {
          clubId,
          competition: {
            status: { in: ["PUBLISHED", "ONGOING"] },
          },
        },
        select: { id: true },
      }),
    ]);

  if (pendingTypeApp) blockers.push("PENDING_TYPE_APPLICATION");
  if (unpaidDues) blockers.push("UNPAID_DUES");
  if (activeIndividual || activeTeam) blockers.push("ACTIVE_COMPETITION_ENTRIES");

  return blockers;
}

export function clubDeleteBlockersMessage(blockers: ClubDeleteBlockReason[]): string {
  const parts: string[] = [];
  if (blockers.includes("PENDING_TYPE_APPLICATION")) {
    parts.push("審査中のクラブ種別申請があります");
  }
  if (blockers.includes("UNPAID_DUES")) {
    parts.push("未払いの会費があります");
  }
  if (blockers.includes("ACTIVE_COMPETITION_ENTRIES")) {
    parts.push("進行中の大会へのエントリーがあります");
  }
  return parts.join("。");
}
