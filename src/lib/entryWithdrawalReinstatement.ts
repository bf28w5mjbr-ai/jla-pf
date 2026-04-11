import type { Prisma } from "@prisma/client";

/**
 * エントリー更新で種目を再度選んだとき、本人棄権（DNS + 理由に「棄権」）を出場待ちに戻す。
 * スタートリスト再生成（{@link refreshStartListSnapshotAfterEligibleEntryChange}）で一覧に戻る。
 */
export async function clearIndividualWithdrawalParticipantStatusesForEvents(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    competitionEntryId: string;
    individualEventIds: readonly string[];
    updatedByUserId: string;
  }
): Promise<void> {
  const { competitionId, competitionEntryId, individualEventIds, updatedByUserId } = params;
  const unique = [...new Set(individualEventIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return;

  await tx.competitionParticipantStatus.updateMany({
    where: {
      competitionId,
      eventId: { in: unique },
      participantType: "INDIVIDUAL",
      competitionEntryId,
      teamEntryId: null,
      status: "DNS",
      reason: { contains: "棄権" },
    },
    data: {
      status: "PENDING",
      reason: null,
      calledAt: null,
      updatedByUserId,
    },
  });
}
