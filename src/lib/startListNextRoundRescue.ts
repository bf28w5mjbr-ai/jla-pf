import type { Prisma, ResultRound } from "@prisma/client";
import {
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  marshalIndividualKey,
  marshalStatusKeyFromParts,
  marshalTeamLegacyKey,
  marshalTeamMemberKey,
} from "@/lib/dayOpsParticipantKeys";
import { expandTeamMarshalRefsWithMembers } from "@/lib/teamMarshalExpand";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { isDayOpsTerminalParticipantStatus } from "@/lib/dayOpsParticipantStatusDisplay";

const TERMINAL_STATUSES = new Set(["DNS", "WITHDRAWN", "DSQ", "DNF"]);

type StatusSnapshotRow = {
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
  teamMemberUserId: string | null;
  status: string;
  calledAt: Date | null;
  reason: string | null;
};

type StatusSnapshot = Map<string, StatusSnapshotRow>;

function statusKeyFromRef(ref: MarshalParticipantRef): string | null {
  return marshalStatusKeyFromParts(
    ref.participantType,
    ref.competitionEntryId ?? null,
    ref.teamEntryId ?? null,
    ref.teamMemberUserId ?? null
  );
}

/**
 * 救済再生成: 次ラ snapshot 更新後に参加者状態とヒート締切を再整合する。
 */
export async function reconcileNextRoundMarshalAfterRescueRegenerate(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    eventId: string;
    toRound: ResultRound;
    snapshot: StartListSnapshotPayload | null;
    statusBefore: StatusSnapshot;
    maxPriorHeatCloseAt: Date | null;
    operatorUserId: string | null;
    now: Date;
  }
): Promise<void> {
  const { competitionId, eventId, toRound, snapshot, statusBefore, maxPriorHeatCloseAt, operatorUserId, now } =
    params;

  const roundData = getRoundDataFromSnapshot(snapshot, eventId, toRound);
  const heats = roundData?.heats ?? [];

  const advancerKeys = new Set<string>();
  for (const heat of heats) {
    const refs = await expandTeamMarshalRefsWithMembers(
      tx,
      marshalParticipantRefsForAutoDsq(roundData, heat.heatIndex)
    );
    for (const ref of refs) {
      const key = statusKeyFromRef(ref);
      if (key) advancerKeys.add(key);
    }
  }

  for (const key of advancerKeys) {
    const prev = statusBefore.get(key);
    if (!prev) continue;
    const where = {
      competitionId,
      eventId,
      participantType: prev.participantType,
      competitionEntryId: prev.competitionEntryId,
      teamEntryId: prev.teamEntryId,
      teamMemberUserId: prev.teamMemberUserId,
      marshalRound: toRound,
    };
    const existing = await tx.competitionParticipantStatus.findFirst({
      where,
      select: { id: true },
    });
    if (existing) {
      await tx.competitionParticipantStatus.update({
        where: { id: existing.id },
        data: {
          status: prev.status as never,
          calledAt: prev.calledAt,
          reason: prev.reason,
          updatedByUserId: operatorUserId,
        },
      });
    } else {
      await tx.competitionParticipantStatus.create({
        data: {
          ...where,
          status: prev.status as never,
          calledAt: prev.calledAt,
          reason: prev.reason,
          updatedByUserId: operatorUserId,
        },
      });
    }
  }

  const staleRows = await tx.competitionParticipantStatus.findMany({
    where: { competitionId, eventId, marshalRound: toRound },
    select: {
      id: true,
      participantType: true,
      competitionEntryId: true,
      teamEntryId: true,
      teamMemberUserId: true,
    },
  });
  for (const row of staleRows) {
    const key = marshalStatusKeyFromParts(
      row.participantType,
      row.competitionEntryId,
      row.teamEntryId,
      row.teamMemberUserId
    );
    if (key && !advancerKeys.has(key)) {
      await tx.competitionParticipantStatus.delete({ where: { id: row.id } });
    }
  }

  await tx.competitionHeatMarshalState.deleteMany({
    where: { competitionId, eventId, round: toRound },
  });

  for (const heat of heats) {
    const refs = await expandTeamMarshalRefsWithMembers(
      tx,
      marshalParticipantRefsForAutoDsq(roundData, heat.heatIndex)
    );
    if (refs.length === 0) continue;

    let allDone = true;
    for (const ref of refs) {
      const key = statusKeyFromRef(ref);
      if (!key) {
        allDone = false;
        break;
      }
      const prev = statusBefore.get(key);
      const st = prev?.status ?? "PENDING";
      if (!isCalledLikeStatus(st) && !isDayOpsTerminalParticipantStatus(st)) {
        allDone = false;
        break;
      }
    }
    if (!allDone) continue;

    await tx.competitionHeatMarshalState.upsert({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId,
          round: toRound,
          heatIndex: heat.heatIndex,
        },
      },
      create: {
        competitionId,
        eventId,
        round: toRound,
        heatIndex: heat.heatIndex,
        callClosedAt: maxPriorHeatCloseAt ?? now,
      },
      update: {
        callClosedAt: maxPriorHeatCloseAt ?? now,
      },
    });
  }
}

export async function snapshotNextRoundMarshalStatuses(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    eventId: string;
    toRound: ResultRound;
  }
): Promise<StatusSnapshot> {
  const rows = await tx.competitionParticipantStatus.findMany({
    where: {
      competitionId: params.competitionId,
      eventId: params.eventId,
      marshalRound: params.toRound,
    },
    select: {
      participantType: true,
      competitionEntryId: true,
      teamEntryId: true,
      teamMemberUserId: true,
      status: true,
      calledAt: true,
      reason: true,
    },
  });
  const out: StatusSnapshot = new Map();
  for (const row of rows) {
    const key = marshalStatusKeyFromParts(
      row.participantType,
      row.competitionEntryId,
      row.teamEntryId,
      row.teamMemberUserId
    );
    if (!key) continue;
    out.set(key, {
      participantType: row.participantType as "INDIVIDUAL" | "TEAM",
      competitionEntryId: row.competitionEntryId,
      teamEntryId: row.teamEntryId,
      teamMemberUserId: row.teamMemberUserId,
      status: row.status,
      calledAt: row.calledAt,
      reason: row.reason,
    });
  }
  return out;
}

export async function maxPriorHeatCloseAtForRound(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    eventId: string;
    toRound: ResultRound;
  }
): Promise<Date | null> {
  const rows = await tx.competitionHeatMarshalState.findMany({
    where: {
      competitionId: params.competitionId,
      eventId: params.eventId,
      round: params.toRound,
      callClosedAt: { not: null },
    },
    select: { callClosedAt: true },
  });
  let max: Date | null = null;
  for (const row of rows) {
    if (!row.callClosedAt) continue;
    if (!max || row.callClosedAt.getTime() > max.getTime()) {
      max = row.callClosedAt;
    }
  }
  return max;
}
