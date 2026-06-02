import type { Prisma, ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  marshalParticipantRefAtLane,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import {
  defaultTerminalReason,
  syncTerminalAndCompactRanksInTransaction,
  TERMINAL_STATUSES,
} from "@/lib/heatLaneTerminalStatus";
import type { TerminalDayOpsStatus } from "@/lib/officialResultTerminalSync";

const TERMINAL_SET = new Set<string>(TERMINAL_STATUSES);

export type HeatLaneTerminalApplyInput = {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  lane: number;
  status: TerminalDayOpsStatus;
  reason?: string;
  operatorUserId: string | null;
};

export type HeatLaneTerminalApplyResult = {
  id: string;
  status: TerminalDayOpsStatus;
  alreadyApplied: boolean;
  officialSyncSkipped: boolean;
};

export async function applyHeatLaneTerminalStatus(
  input: HeatLaneTerminalApplyInput
): Promise<HeatLaneTerminalApplyResult> {
  const targetStatus = input.status;
  const reason = input.reason?.trim() || defaultTerminalReason(targetStatus);
  const { competitionId, eventId, round: roundDb, heatIndex, lane, operatorUserId } = input;

  const snapshot = await loadStartListSnapshotPayload(competitionId);
  const roundData = getRoundDataFromSnapshot(snapshot, eventId, roundDb);
  const heat = getHeatFromRoundData(roundData, heatIndex);
  const target = marshalParticipantRefAtLane(heat, lane);
  if (!target) {
    throw new Error("LANE_EMPTY");
  }

  const now = new Date();
  const participantBase = {
    competitionId,
    eventId,
    participantType: target.participantType,
    competitionEntryId: target.competitionEntryId ?? null,
    teamEntryId: target.teamEntryId ?? null,
  } as const;

  const { upserted, officialSyncSkipped } = await prisma.$transaction(async (tx) => {
    const terminalAny = await tx.competitionParticipantStatus.findFirst({
      where: {
        ...participantBase,
        status: { in: [...TERMINAL_STATUSES] },
      },
      select: { id: true, status: true },
    });
    if (terminalAny?.status === targetStatus) {
      const skipped = await syncTerminalAndCompactRanksInTransaction(tx, {
        competitionId,
        eventId,
        round: roundDb,
        heatIndex,
        lane,
        participant: target,
        status: targetStatus,
        reason,
      });
      return {
        upserted: {
          id: terminalAny.id,
          status: targetStatus,
          alreadyApplied: true as const,
        },
        officialSyncSkipped: skipped,
      };
    }
    if (terminalAny && TERMINAL_SET.has(terminalAny.status)) {
      throw new Error("PARTICIPANT_TERMINAL_OTHER");
    }

    const existingRound = await tx.competitionParticipantStatus.findFirst({
      where: {
        ...participantBase,
        marshalRound: roundDb,
      },
      select: { id: true, status: true },
    });

    const row = existingRound
      ? await tx.competitionParticipantStatus.update({
          where: { id: existingRound.id },
          data: {
            status: targetStatus,
            reason,
            calledAt: null,
            updatedByUserId: operatorUserId,
          },
        })
      : await tx.competitionParticipantStatus.create({
          data: {
            ...participantBase,
            marshalRound: roundDb,
            status: targetStatus,
            reason,
            calledAt: null,
            updatedByUserId: operatorUserId,
          },
        });

    await markMarshalStartedIfUnset(tx.event, eventId, now);

    const skipped = await syncTerminalAndCompactRanksInTransaction(tx, {
      competitionId,
      eventId,
      round: roundDb,
      heatIndex,
      lane,
      participant: target,
      status: targetStatus,
      reason,
    });

    return {
      upserted: {
        id: row.id,
        status: targetStatus,
        alreadyApplied: false as const,
      },
      officialSyncSkipped: skipped,
    };
  });

  return {
    id: upserted.id,
    status: upserted.status,
    alreadyApplied: upserted.alreadyApplied,
    officialSyncSkipped,
  };
}

export function participantRefFromLaneTarget(target: MarshalParticipantRef): MarshalParticipantRef {
  return target;
}
