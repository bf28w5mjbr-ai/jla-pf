import { randomUUID } from "node:crypto";
import type { Prisma, ResultRound } from "@prisma/client";
import {
  resolveHeatResultNextRank,
  statsFromHeatOkRows,
  type LastOkRowRef,
} from "@/lib/heatResultCaptureNextRank";
import { prisma } from "@/server/db";
import {
  effectiveDayOpsStatusForMarshalDisplay,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { isDsqOnlyOfficialRow } from "@/lib/officialResultDsqSync";
import type { HeatDayOpsResolvedSlot } from "@/lib/heatDayOpsResolveParticipantInHeat";
import { computeDescInputCalledBaselineInHeat } from "@/lib/marshalHeatCalledCount";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  pickParticipantStatusForRound,
  type ParticipantStatusRowForScope,
} from "@/lib/competitionParticipantStatusScope";
import { assertOfficialResultWritableForCompetition } from "@/lib/officialResultAutoLock";

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
    /** confirm-heat トランザクション内で既に読んだ参加者ステータス */
    eventStatusRows?: ParticipantStatusRowForScope[];
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
    eventStatusRows,
  } = params;

  const existing = await tx.officialResult.findUnique({
    where: {
      competitionId_eventId_round: { competitionId, eventId, round },
    },
    select: { id: true, lockedAt: true },
  });
  await assertOfficialResultWritableForCompetition(tx, competitionId, existing?.lockedAt);

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

  const needsDescBaseline = entries.some(
    (e) => e.entry.tieWithPrevious !== true && e.entry.inputOrder === "desc"
  );
  let descCalledBaseline: number | null = null;
  if (needsDescBaseline) {
    descCalledBaseline = await computeDescInputCalledBaselineInHeat({
      tx,
      competitionId,
      eventId,
      round,
      heatIndex,
      heatMarshalCallClosed: true,
      snapshot: snapshotForDescInput,
      statusRows: eventStatusRows,
    });
    if (descCalledBaseline <= 0) {
      throw new Error("DESC_INPUT_NO_CALLED");
    }
  }

  const initialOkRows = await tx.officialResultRow.findMany({
    where: {
      officialResultId: officialResult.id,
      heat: heatIndex,
      status: "OK",
    },
    select: { rank: true },
  });
  let stats = statsFromHeatOkRows(initialOkRows);
  let lastOkRowInBatch: LastOkRowRef | null = null;

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

    const { nextRank, tieGroup, previousRowTieGroupUpdate } = await resolveHeatResultNextRank({
      tx,
      officialResultId: officialResult.id,
      heatIndex,
      tieWithPrevious: body.tieWithPrevious === true,
      inputOrder: body.inputOrder ?? "asc",
      descCalledBaseline,
      stats,
      lastOkRowInBatch,
    });
    if (previousRowTieGroupUpdate) {
      await tx.officialResultRow.update({
        where: { id: previousRowTieGroupUpdate.id },
        data: { tieGroup: previousRowTieGroupUpdate.tieGroup },
      });
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

    const assignedRank = created.rank ?? nextRank;
    createdRows.push({
      rank: assignedRank,
      lane: slot.lane,
      participantType: target.participantType,
      competitionEntryId: target.competitionEntryId,
      teamEntryId: target.teamEntryId,
    });
    stats = statsFromHeatOkRows([
      ...initialOkRows,
      ...createdRows.map((r) => ({ rank: r.rank })),
    ]);
    lastOkRowInBatch = {
      id: created.id,
      rank: assignedRank,
      tieGroup,
    };
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
  if (storedStatus === "DNS" || effectiveStatus === "DNS") {
    return { ok: false, error: "欠場（DNS）のためリザルトを記録できません。", status: 409 };
  }
  if (storedStatus === "WITHDRAWN" || effectiveStatus === "WITHDRAWN") {
    return { ok: false, error: "棄権のためリザルトを記録できません。", status: 409 };
  }
  if (storedStatus === "DNF" || effectiveStatus === "DNF") {
    return { ok: false, error: "DNF（途中辞退）のためリザルトを記録できません。", status: 409 };
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

function storedStatusForManualAppendTarget(
  rows: ParticipantStatusRowForScope[],
  round: ResultRound,
  target: HeatDayOpsResolvedSlot["target"]
): string {
  const matching = rows.filter(
    (r) =>
      r.participantType === target.participantType &&
      r.competitionEntryId === (target.competitionEntryId ?? null) &&
      r.teamEntryId === (target.teamEntryId ?? null) &&
      (target.participantType !== "TEAM" ||
        (r.teamMemberUserId ?? null) === (target.teamMemberUserId ?? null))
  );
  return pickParticipantStatusForRound(matching, round).status;
}

export type ManualResultAppendGateContext = {
  heatMarshalCallClosed: boolean;
  validIndividualEntryIds: Set<string>;
  validTeamEntryIds: Set<string>;
  dayOpsRows: ParticipantStatusRowForScope[];
};

/** confirm-heat / run-up: 同一ヒートの manualEntries を一括検証するための事前読み込み */
export async function loadManualResultAppendGateForConfirm(params: {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  resolvedSlots: HeatDayOpsResolvedSlot[];
  /** 呼び出し元で既に読んだ参加者ステータス（findMany の二重実行を避ける） */
  eventStatusRows?: ParticipantStatusRowForScope[];
  /** 呼び出し元で既知の場合は渡す（marshal 行の findUnique を省略） */
  heatMarshalCallClosed?: boolean;
}): Promise<
  { ok: true; gate: ManualResultAppendGateContext } | { ok: false; error: string; status: number }
> {
  const {
    competitionId,
    eventId,
    round,
    heatIndex,
    resolvedSlots,
    eventStatusRows,
    heatMarshalCallClosed: heatMarshalCallClosedKnown,
  } = params;
  const individualIds = [
    ...new Set(
      resolvedSlots
        .map((r) =>
          r.target.participantType === "INDIVIDUAL" ? r.target.competitionEntryId : null
        )
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const teamIds = [
    ...new Set(
      resolvedSlots
        .map((r) => (r.target.participantType === "TEAM" ? r.target.teamEntryId : null))
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const dayOpsRowsPromise =
    eventStatusRows !== undefined
      ? Promise.resolve(eventStatusRows)
      : prisma.competitionParticipantStatus.findMany({
          where: { competitionId, eventId, marshalRound: round },
          select: {
            participantType: true,
            competitionEntryId: true,
            teamEntryId: true,
            teamMemberUserId: true,
            status: true,
            calledAt: true,
            marshalRound: true,
            updatedAt: true,
          },
        });

  const [heatMarshalRow, dayOpsRows, validIndividuals, validTeams] = await Promise.all([
    heatMarshalCallClosedKnown !== undefined
      ? Promise.resolve(
          heatMarshalCallClosedKnown ? { callClosedAt: new Date() } : { callClosedAt: null }
        )
      : prisma.competitionHeatMarshalState.findUnique({
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
    dayOpsRowsPromise,
    individualIds.length
      ? prisma.competitionEntry.findMany({
          where: {
            id: { in: individualIds },
            competitionId,
            items: { some: { eventId } },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.teamEntry.findMany({
          where: { id: { in: teamIds }, competitionId, eventId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const heatMarshalCallClosed =
    heatMarshalCallClosedKnown ?? Boolean(heatMarshalRow?.callClosedAt);
  if (!heatMarshalCallClosed) {
    return {
      ok: false,
      error:
        "マーシャル締切後にのみリザルトを記録できます。当日運用のヒート一覧で「このヒートを締切」を先に実行してください。",
      status: 409,
    };
  }

  return {
    ok: true,
    gate: {
      heatMarshalCallClosed,
      validIndividualEntryIds: new Set(validIndividuals.map((e) => e.id)),
      validTeamEntryIds: new Set(validTeams.map((e) => e.id)),
      dayOpsRows,
    },
  };
}

export function assertManualResultAppendAllowedWithGate(params: {
  round: ResultRound;
  resolved: HeatDayOpsResolvedSlot;
  gate: ManualResultAppendGateContext;
}): { ok: true } | { ok: false; error: string; status: number } {
  const { round, resolved, gate } = params;
  const { target } = resolved;

  if (target.participantType === "INDIVIDUAL" && target.competitionEntryId) {
    if (!gate.validIndividualEntryIds.has(target.competitionEntryId)) {
      return { ok: false, error: "個人エントリーがこの種目に一致しません", status: 400 };
    }
  }
  if (target.participantType === "TEAM" && target.teamEntryId) {
    if (!gate.validTeamEntryIds.has(target.teamEntryId)) {
      return { ok: false, error: "チームエントリーがこの種目に一致しません", status: 400 };
    }
  }

  const storedStatus = storedStatusForManualAppendTarget(gate.dayOpsRows, round, target);
  const effectiveStatus = effectiveDayOpsStatusForMarshalDisplay(
    storedStatus,
    gate.heatMarshalCallClosed
  );
  if (storedStatus === "DSQ" || effectiveStatus === "DSQ") {
    return {
      ok: false,
      error:
        "失格（DSQ）のためリザルトを記録できません。マーシャル未完了による未出場とは別扱いです。",
      status: 409,
    };
  }
  if (storedStatus === "DNS" || effectiveStatus === "DNS") {
    return { ok: false, error: "欠場（DNS）のためリザルトを記録できません。", status: 409 };
  }
  if (storedStatus === "WITHDRAWN" || effectiveStatus === "WITHDRAWN") {
    return { ok: false, error: "棄権のためリザルトを記録できません。", status: 409 };
  }
  if (storedStatus === "DNF" || effectiveStatus === "DNF") {
    return { ok: false, error: "DNF（途中辞退）のためリザルトを記録できません。", status: 409 };
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

/** confirm-heat: DSQ 参加者は manualEntries から除外する（他の拒否理由は呼び出し側でエラー） */
export function isManualResultAppendTargetDsq(params: {
  round: ResultRound;
  resolved: HeatDayOpsResolvedSlot;
  gate: ManualResultAppendGateContext;
}): boolean {
  const { round, resolved, gate } = params;
  const storedStatus = storedStatusForManualAppendTarget(gate.dayOpsRows, round, resolved.target);
  const effectiveStatus = effectiveDayOpsStatusForMarshalDisplay(
    storedStatus,
    gate.heatMarshalCallClosed
  );
  return storedStatus === "DSQ" || effectiveStatus === "DSQ";
}
