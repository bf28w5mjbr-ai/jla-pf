import type { Prisma, ResultRound } from "@prisma/client";
import { expandTeamMarshalRefsWithMembers } from "@/lib/teamMarshalExpand";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
  resolveMarshalSlotInHeat,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import { syncTerminalAndCompactRanksInTransaction } from "@/lib/heatLaneTerminalStatus";
import { marshalStatusKeyFromParts } from "@/lib/dayOpsParticipantKeys";

export const MARSHAL_CLOSE_DNS_REASON = "マーシャル未完了により欠場";

type ExistingRow = {
  id: string;
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  teamMemberUserId: string | null;
  status: string;
};

/**
 * ヒート締切時: 当ラウンドで未召集（PENDING 相当）の参加者を DNS にし公式行を同期する。
 */
export async function applyMarshalCloseDnsForHeatInTransaction(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    snapshot: StartListSnapshotPayload | null;
    operatorUserId: string | null;
    now: Date;
  }
): Promise<{ dnsCount: number; officialSyncSkipped: boolean }> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  const heat = getHeatFromRoundData(roundData, opts.heatIndex);
  const refs = await expandTeamMarshalRefsWithMembers(
    tx,
    marshalParticipantRefsForAutoDsq(roundData, opts.heatIndex)
  );

  let dnsCount = 0;
  let officialSyncSkipped = false;

  for (const ref of refs) {
    const slot = resolveMarshalSlotInHeat(heat, ref);
    if (!slot) continue;

    const participantBase = {
      competitionId: opts.competitionId,
      eventId: opts.eventId,
      participantType: ref.participantType,
      competitionEntryId: ref.competitionEntryId ?? null,
      teamEntryId: ref.teamEntryId ?? null,
      teamMemberUserId: ref.teamMemberUserId ?? null,
    };

    const existingRows: ExistingRow[] = await tx.competitionParticipantStatus.findMany({
      where: {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        participantType: ref.participantType,
        competitionEntryId: ref.competitionEntryId ?? null,
        teamEntryId: ref.teamEntryId ?? null,
        ...(ref.teamMemberUserId != null
          ? { teamMemberUserId: ref.teamMemberUserId }
          : { teamMemberUserId: null }),
        marshalRound: opts.round,
      },
      select: {
        id: true,
        participantType: true,
        competitionEntryId: true,
        teamEntryId: true,
        teamMemberUserId: true,
        status: true,
      },
    });

    const terminalCrossRound = await tx.competitionParticipantStatus.findFirst({
      where: {
        competitionId: opts.competitionId,
        eventId: opts.eventId,
        participantType: ref.participantType,
        competitionEntryId: ref.competitionEntryId ?? null,
        teamEntryId: ref.teamEntryId ?? null,
        ...(ref.teamMemberUserId != null
          ? { teamMemberUserId: ref.teamMemberUserId }
          : {}),
        status: { in: ["DNS", "WITHDRAWN", "DSQ", "DNF"] },
      },
      select: { status: true },
    });
    if (terminalCrossRound) continue;

    const roundRow = existingRows[0];
    const storedStatus = roundRow?.status ?? "PENDING";
    if (storedStatus === "CALLED" || storedStatus === "CHECKED_IN") continue;
    if (storedStatus === "DNS" || storedStatus === "WITHDRAWN" || storedStatus === "DSQ" || storedStatus === "DNF") {
      continue;
    }

    if (roundRow) {
      await tx.competitionParticipantStatus.update({
        where: { id: roundRow.id },
        data: {
          status: "DNS",
          reason: MARSHAL_CLOSE_DNS_REASON,
          calledAt: null,
          updatedByUserId: opts.operatorUserId,
        },
      });
    } else {
      await tx.competitionParticipantStatus.create({
        data: {
          ...participantBase,
          marshalRound: opts.round,
          status: "DNS",
          reason: MARSHAL_CLOSE_DNS_REASON,
          calledAt: null,
          updatedByUserId: opts.operatorUserId,
        },
      });
    }

    dnsCount += 1;

    const officialRef: MarshalParticipantRef =
      ref.participantType === "TEAM" && ref.teamEntryId
        ? {
            participantType: "TEAM",
            competitionEntryId: null,
            teamEntryId: ref.teamEntryId,
          }
        : ref;

    const skipped = await syncTerminalAndCompactRanksInTransaction(tx, {
      competitionId: opts.competitionId,
      eventId: opts.eventId,
      round: opts.round,
      heatIndex: opts.heatIndex,
      lane: slot.lane,
      participant: officialRef,
      status: "DNS",
      reason: MARSHAL_CLOSE_DNS_REASON,
    });
    if (skipped) officialSyncSkipped = true;
  }

  if (dnsCount > 0) {
    await markMarshalStartedIfUnset(tx.event, opts.eventId, opts.now);
  }

  return { dnsCount, officialSyncSkipped };
}

/** @internal test helper */
export function marshalCloseDnsParticipantKey(ref: MarshalParticipantRef): string | null {
  return marshalStatusKeyFromParts(
    ref.participantType,
    ref.competitionEntryId,
    ref.teamEntryId,
    ref.teamMemberUserId
  );
}
