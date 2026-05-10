import type { Prisma } from "@prisma/client";
import type { OfficialApplicationEntryType } from "@/lib/officialApplicationSubmit";

/**
 * 大会オフィシャル応募（TECHNICAL / GENERAL）と CompetitionTechnicalOfficialAssignment を揃える。
 * - TECHNICAL: 当該 clubId で upsert（invitationId は null）。別クラブの同一大会・同一ユーザー行は削除。
 * - GENERAL: この大会・ユーザーで invitationId が null の任命を削除（公式応募経由のみ扱い）。招待承認で付いた行は残す。
 */
export async function syncTechnicalOfficialAssignmentFromOfficialApplication(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    userId: string;
    entryType: OfficialApplicationEntryType;
    clubId: string;
  }
): Promise<void> {
  const { competitionId, userId, entryType, clubId } = params;

  if (entryType === "GENERAL") {
    await tx.competitionTechnicalOfficialAssignment.deleteMany({
      where: { competitionId, userId, invitationId: null },
    });
    return;
  }

  if (!clubId) return;

  await tx.competitionTechnicalOfficialAssignment.deleteMany({
    where: {
      competitionId,
      userId,
      clubId: { not: clubId },
    },
  });

  await tx.competitionTechnicalOfficialAssignment.upsert({
    where: {
      competitionId_clubId_userId: { competitionId, clubId, userId },
    },
    create: {
      competitionId,
      clubId,
      userId,
      invitationId: null,
    },
    update: {},
  });
}

/** 大会オフィシャル応募の取り消し: 公式応募経由の任命のみ削除（招待経由の行は残す） */
export async function clearTechnicalOfficialAssignmentsFromOfficialApplicationWithdraw(
  tx: Prisma.TransactionClient,
  params: { competitionId: string; userId: string }
): Promise<void> {
  const { competitionId, userId } = params;
  await tx.competitionTechnicalOfficialAssignment.deleteMany({
    where: { competitionId, userId, invitationId: null },
  });
}
