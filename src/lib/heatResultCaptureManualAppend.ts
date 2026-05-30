import { randomUUID } from "node:crypto";
import type { Prisma, ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  DAY_OPS_STATUS_MARSHAL_ABSENT,
  effectiveDayOpsStatusForMarshalDisplay,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { isDsqOnlyOfficialRow } from "@/lib/officialResultDsqSync";
import type { HeatDayOpsResolvedSlot } from "@/lib/heatDayOpsResolveParticipantInHeat";
import { computeDescInputCalledBaselineInHeat } from "@/lib/marshalHeatCalledCount";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";

export type ManualResultAppendEntry = {
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string;
  tieWithPrevious?: boolean;
  inputOrder?: "asc" | "desc";
};

export type ManualResultAppendCreated = {
  rank: number;
  lane: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

/**
 * リザルト確定直前など: 1 トランザクション内で手動 append を順に実行する。
 */
export async function appendManualHeatResultsInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    operatorUserId: string | null;
    entries: Array<{ resolved: HeatDayOpsResolvedSlot; entry: ManualResultAppendEntry }>;
    snapshotForDescInput: StartListSnapshotPayload | null;
  }
): Promise<ManualResultAppendCreated[]> {
  const {
    competitionId,
    eventId,
    round,
    heatIndex,
    operatorUserId,
    entries,
    snapshotForDescInput,
  } = params;

  const existing = await tx.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: { id: true, lockedAt: true },
  });
  if (existing?.lockedAt) {
    throw new Error("OFFICIAL_RESULT_LOCKED");
  }

  const officialResult = await tx.officialResult.upsert({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    create: {
      competitionId,
      eventId,
      round,
      publishedAt: null,
      lockedAt: null,
    },
    update: {},
    select: { id: true },
  });

  const heatConfirmedRow = await tx.officialResultHeatConfirmed.findUnique({
    where: {
      officialResultId_heat: {
        officialResultId: officialResult.id,
        heat: heatIndex,
      },
    },
    select: { id: true },
  });
  if (heatConfirmedRow) {
    throw new Error("HEAT_RESULT_CONFIRMED");
  }

  const createdRows: ManualResultAppendCreated[] = [];

  for (const { resolved, entry } of entries) {
    const { target, slot } = resolved;
    const body = entry;

    const dupWhere =
      target.participantType === "INDIVIDUAL"
        ? {
            officialResultId: officialResult.id,
            heat: heatIndex,
            entryType: "INDIVIDUAL" as const,
            competitionEntryId: target.competitionEntryId,
          }
        : {
            officialResultId: officialResult.id,
            heat: heatIndex,
            entryType: "TEAM" as const,
            teamEntryId: target.teamEntryId,
          };

    const duplicate = await tx.officialResultRow.findFirst({
      where: dupWhere,
      select: { id: true, rank: true, advanceWithoutRank: true, status: true },
    });
    if (duplicate) {
      if (duplicate.advanceWithoutRank) {
        throw new Error("ALREADY_RUN_UP_IN_HEAT");
      }
      if (duplicate.rank != null) {
        createdRows.push({
          rank: duplicate.rank,
          lane: slot.lane,
          participantType: target.participantType,
          competitionEntryId: target.competitionEntryId,
          teamEntryId: target.teamEntryId,
        });
        continue;
      }
      if (isDsqOnlyOfficialRow(duplicate)) {
        // 失格同期済みの DSQ 行（rank なし）を着順付き OK 行へ上書き
      } else {
        throw new Error("ALREADY_RANKED_IN_HEAT");
      }
    }

    const agg = await tx.officialResultRow.aggregate({
      where: {
        officialResultId: officialResult.id,
        heat: heatIndex,
        status: "OK",
      },
      _max: { rank: true },
      _count: { _all: true },
    });
    let nextRank = (agg._max.rank ?? 0) + 1;
    let tieGroup: string | null = null;
    if (body.tieWithPrevious === true) {
      const previous = await tx.officialResultRow.findFirst({
        where: {
          officialResultId: officialResult.id,
          heat: heatIndex,
          status: "OK",
        },
        orderBy: [{ rank: "desc" }, { createdAt: "desc" }],
        select: { id: true, rank: true, tieGroup: true },
      });
      if (!previous || previous.rank == null) {
        throw new Error("TIE_NEEDS_PREVIOUS_RESULT");
      }
      nextRank = previous.rank;
      tieGroup = previous.tieGroup ?? randomUUID();
      if (!previous.tieGroup) {
        await tx.officialResultRow.update({
          where: { id: previous.id },
          data: { tieGroup },
        });
      }
    }
    if (body.tieWithPrevious !== true && body.inputOrder === "desc") {
      const calledInHeat = await computeDescInputCalledBaselineInHeat({
        tx,
        competitionId,
        eventId,
        round,
        heatIndex,
        heatMarshalCallClosed: true,
        snapshot: snapshotForDescInput,
      });
      if (calledInHeat <= 0) {
        throw new Error("DESC_INPUT_NO_CALLED");
      }
      nextRank = Math.max(1, calledInHeat - agg._count._all);
    }

    const rowData = {
      entryType: target.participantType === "INDIVIDUAL" ? ("INDIVIDUAL" as const) : ("TEAM" as const),
      competitionEntryId: target.competitionEntryId,
      teamEntryId: target.teamEntryId,
      rank: nextRank,
      status: "OK" as const,
      advanceWithoutRank: false,
      heat: heatIndex,
      lane: slot.lane,
      tieGroup,
      unit: "OTHER" as const,
      remarks: null as string | null,
    };
    const created =
      duplicate && isDsqOnlyOfficialRow(duplicate)
        ? await tx.officialResultRow.update({
            where: { id: duplicate.id },
            data: rowData,
            select: { id: true, rank: true },
          })
        : await tx.officialResultRow.create({
            data: {
              officialResultId: officialResult.id,
              ...rowData,
            },
            select: { id: true, rank: true },
          });

    await tx.competitionHeatResultCaptureEvent.create({
      data: {
        id: randomUUID(),
        competitionId,
        eventId,
        round,
        heatIndex,
        lane: slot.lane,
        rank: created.rank,
        tieGroup,
        source: "MANUAL",
        eventType: "APPEND",
        participantType: target.participantType,
        competitionEntryId: target.competitionEntryId,
        teamEntryId: target.teamEntryId,
        capturedByUserId: operatorUserId,
      },
    });

    createdRows.push({
      rank: created.rank ?? nextRank,
      lane: slot.lane,
      participantType: target.participantType,
      competitionEntryId: target.competitionEntryId,
      teamEntryId: target.teamEntryId,
    });
  }

  return createdRows;
}

/** append ルートと同様のマーシャル・参加者ステータス検証 */
export async function assertManualResultAppendAllowed(params: {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  resolved: HeatDayOpsResolvedSlot;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { competitionId, eventId, round, heatIndex, resolved } = params;
  const { target } = resolved;

  if (target.participantType === "INDIVIDUAL" && target.competitionEntryId) {
    const ok = await prisma.competitionEntry.findFirst({
      where: {
        id: target.competitionEntryId,
        competitionId,
        items: { some: { eventId } },
      },
      select: { id: true },
    });
    if (!ok) {
      return { ok: false, error: "個人エントリーがこの種目に一致しません", status: 400 };
    }
  }
  if (target.participantType === "TEAM" && target.teamEntryId) {
    const ok = await prisma.teamEntry.findFirst({
      where: { id: target.teamEntryId, competitionId, eventId },
      select: { id: true },
    });
    if (!ok) {
      return { ok: false, error: "チームエントリーがこの種目に一致しません", status: 400 };
    }
  }

  const [heatMarshalRow, dayOpsRow] = await Promise.all([
    prisma.competitionHeatMarshalState.findUnique({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId,
          eventId,
          round,
          heatIndex,
        },
      },
      select: { callClosedAt: true },
    }),
    prisma.competitionParticipantStatus.findFirst({
      where: {
        competitionId,
        eventId,
        participantType: target.participantType,
        competitionEntryId: target.competitionEntryId ?? null,
        teamEntryId: target.teamEntryId ?? null,
        teamMemberUserId:
          target.participantType === "TEAM" ? target.teamMemberUserId ?? null : null,
        marshalRound: round,
      },
      select: { status: true },
    }),
  ]);

  const heatMarshalCallClosed = Boolean(heatMarshalRow?.callClosedAt);
  if (!heatMarshalCallClosed) {
    return {
      ok: false,
      error:
        "マーシャル締切後にのみリザルトを記録できます。当日運用のヒート一覧で「このヒートを締切」を先に実行してください。",
      status: 409,
    };
  }

  const storedStatus = dayOpsRow?.status ?? "PENDING";
  const effectiveStatus = effectiveDayOpsStatusForMarshalDisplay(
    storedStatus,
    heatMarshalCallClosed
  );
  if (storedStatus === "DSQ" || effectiveStatus === "DSQ") {
    return {
      ok: false,
      error:
        "失格（DSQ）のためリザルトを記録できません。マーシャル未完了による未出場とは別扱いです。",
      status: 409,
    };
  }
  if (effectiveStatus === DAY_OPS_STATUS_MARSHAL_ABSENT) {
    return {
      ok: false,
      error:
        "マーシャル締切済みで未召集のため未出場扱いです（競技中の失格 DSQ とは別）。リザルトは記録できません。",
      status: 409,
    };
  }
  if (storedStatus === "PENDING") {
    return {
      ok: false,
      error: "マーシャル（召集チェック）が完了していないため、リザルトを記録できません",
      status: 409,
    };
  }
  if (!isCalledLikeStatus(storedStatus)) {
    return {
      ok: false,
      error: "召集済み（CALLED）の参加者のみリザルトを記録できます",
      status: 409,
    };
  }

  return { ok: true };
}
