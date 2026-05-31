import { prisma } from "@/server/db";

/**
 * 種目単位の当日運用「変化指紋」。ポーリング代替の SSE で max(updatedAt) の組を比較する。
 */
export async function computeDayOpsLiveFingerprint(
  competitionId: string,
  eventId: string
): Promise<string> {
  const [participantMax, marshalMax, officialResultMax, officialRowMax, captureEventMax] =
    await prisma.$transaction([
    prisma.competitionParticipantStatus.aggregate({
      where: { competitionId, eventId },
      _max: { updatedAt: true },
    }),
    prisma.competitionHeatMarshalState.aggregate({
      where: { competitionId, eventId },
      _max: { updatedAt: true },
    }),
    prisma.officialResult.aggregate({
      where: { competitionId, eventId },
      _max: { updatedAt: true },
    }),
    prisma.officialResultRow.aggregate({
      where: { officialResult: { competitionId, eventId } },
      _max: { updatedAt: true },
    }),
    prisma.competitionHeatResultCaptureEvent.aggregate({
      where: { competitionId, eventId },
      _max: { createdAt: true },
    }),
  ]);

  const t = (d: Date | null | undefined) => (d ? d.getTime() : 0);
  return [
    t(participantMax._max.updatedAt),
    t(marshalMax._max.updatedAt),
    t(officialResultMax._max.updatedAt),
    t(officialRowMax._max.updatedAt),
    t(captureEventMax._max.createdAt),
  ].join(":");
}
