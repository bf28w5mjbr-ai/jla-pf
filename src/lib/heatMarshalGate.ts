import type { ResultRound } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  findHeatIndexInRound,
  getRoundDataFromSnapshot,
  parseStartListSnapshotForMarshal,
  parseStartListSnapshotLooseForRoundRead,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";

function parseStartListSnapshotRowData(
  data: unknown
): StartListSnapshotPayload | null {
  return (
    parseStartListSnapshotForMarshal(data) ?? parseStartListSnapshotLooseForRoundRead(data)
  );
}

export async function loadStartListSnapshotPayload(
  competitionId: string
): Promise<StartListSnapshotPayload | null> {
  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });
  return parseStartListSnapshotForMarshal(row?.data);
}

/** マーシャル厳密チェックなしでスナップショットの rounds/heats を読む（version 2 等） */
export async function loadStartListSnapshotPayloadLoose(
  competitionId: string
): Promise<StartListSnapshotPayload | null> {
  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });
  return parseStartListSnapshotLooseForRoundRead(row?.data);
}

/** 1 回の DB 読み取りで厳密→緩和の順にパース（PUT/bulk 等向け） */
export async function loadStartListSnapshotPayloadWithFallback(
  competitionId: string
): Promise<StartListSnapshotPayload | null> {
  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });
  return parseStartListSnapshotRowData(row?.data);
}

export async function getClosedMarshalHeatIndices(
  client: Prisma.TransactionClient | typeof prisma,
  competitionId: string,
  eventId: string,
  marshalRound: ResultRound
): Promise<Set<number>> {
  const rows = await client.competitionHeatMarshalState.findMany({
    where: {
      competitionId,
      eventId,
      round: marshalRound,
      callClosedAt: { not: null },
    },
    select: { heatIndex: true },
  });
  return new Set(rows.map((r) => r.heatIndex));
}

export function isMarshalHeatCallClosed(closedHeatIndices: Set<number>, heatIndex: number | null): boolean {
  if (heatIndex == null) return false;
  return closedHeatIndices.has(heatIndex);
}

export function resolveParticipantMarshalHeat(
  snapshot: StartListSnapshotPayload | null,
  eventId: string,
  marshalRound: ResultRound,
  participant: MarshalParticipantRef
): number | null {
  const roundData = getRoundDataFromSnapshot(snapshot, eventId, marshalRound);
  return findHeatIndexInRound(roundData, participant);
}
