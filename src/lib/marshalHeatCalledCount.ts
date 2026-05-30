import type { ResultRound } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { StartListHeat } from "@/lib/startListRounds";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import {
  buildParticipantMarshalDisplayByKeyForRound,
  type ParticipantStatusRowForScope,
} from "@/lib/competitionParticipantStatusScope";
import { effectiveDayOpsStatusForMarshalDisplay } from "@/lib/dayOpsParticipantStatusDisplay";
import {
  marshalIndividualKey,
  marshalTeamLegacyKey,
  marshalTeamMemberKey,
} from "@/lib/dayOpsParticipantKeys";
import { isCalledLikeStatus, isTeamFullyCalled } from "@/lib/dayOpsTeamStatus";
import { getHeatFromRoundData, getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { fetchTeamMembersMapForTeamIds } from "@/lib/teamMarshalExpand";

/**
 * heat-marshal GET が組み立てる参加者行と同じキー・締切表示ルールで、
 * ヒート内の「召集済（effective が CALLED）」スロット数を数える。
 * リザルト降順入力の基準人数はこの値と一致させる。
 */
export function countCalledMarshalSlotsInHeat(opts: {
  heatMarshalCallClosed: boolean;
  heat: StartListHeat;
  statusByKey: Map<string, { status: string; calledAt: Date | null }>;
  teamMembersByTeamId: Map<string, Array<{ userId: string; label: string }>>;
}): number {
  const { heatMarshalCallClosed, heat, statusByKey, teamMembersByTeamId } = opts;
  const parts = heat.participants ?? [];
  const byTeam = new Map<string, Array<{ status: string }>>();
  let indiv = 0;

  for (const p of parts) {
    if (p.kind === "INDIVIDUAL") {
      const st = statusByKey.get(marshalIndividualKey(p.entryId));
      const stored = st?.status ?? "PENDING";
      const eff = effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed);
      if (isCalledLikeStatus(eff)) indiv += 1;
      continue;
    }
    if (p.kind === "TEAM" && p.teamEntryId) {
      const members = teamMembersByTeamId.get(p.teamEntryId) ?? [];
      if (members.length === 0) {
        const stUnassigned = statusByKey.get(marshalTeamLegacyKey(p.teamEntryId));
        const stored = stUnassigned?.status ?? "PENDING";
        const eff = effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed);
        const list = byTeam.get(p.teamEntryId) ?? [];
        list.push({ status: eff });
        byTeam.set(p.teamEntryId, list);
      } else {
        const list = byTeam.get(p.teamEntryId) ?? [];
        for (const mem of members) {
          const st = statusByKey.get(marshalTeamMemberKey(p.teamEntryId, mem.userId));
          const stored = st?.status ?? "PENDING";
          const eff = effectiveDayOpsStatusForMarshalDisplay(stored, heatMarshalCallClosed);
          list.push({ status: eff });
        }
        byTeam.set(p.teamEntryId, list);
      }
    }
  }

  let teams = 0;
  for (const [, rows] of byTeam) {
    if (isTeamFullyCalled(rows.map((r) => r.status))) teams += 1;
  }
  return indiv + teams;
}

export async function fetchParticipantStatusesForMarshalEvent(
  db: Pick<Prisma.TransactionClient, "competitionParticipantStatus">,
  competitionId: string,
  eventId: string
): Promise<ParticipantStatusRowForScope[]> {
  return db.competitionParticipantStatus.findMany({
    where: { competitionId, eventId },
    orderBy: { updatedAt: "desc" },
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
}

/**
 * リザルト append の降順モード用: マーシャル一覧 API と同じルールでの CALLED 人数（チームは全構成員 CALLED で1）。
 * `heatMarshalCallClosed` は当該ヒートが締切済みのとき true（effective 表示と一致させる）。
 */
export async function computeDescInputCalledBaselineInHeat(opts: {
  tx: Prisma.TransactionClient;
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  heatMarshalCallClosed: boolean;
  snapshot: StartListSnapshotPayload | null;
  /** 同一トランザクション内で既に読んだ場合は渡す（二重 GET を省略） */
  statusRows?: ParticipantStatusRowForScope[];
}): Promise<number> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  const heat = getHeatFromRoundData(roundData, opts.heatIndex);
  if (!heat) return 0;

  const statuses =
    opts.statusRows ??
    (await fetchParticipantStatusesForMarshalEvent(
      opts.tx,
      opts.competitionId,
      opts.eventId
    ));
  const statusByKey = buildParticipantMarshalDisplayByKeyForRound(statuses, opts.round);
  const teamIds = new Set<string>();
  for (const p of heat.participants ?? []) {
    if (p.kind === "TEAM" && p.teamEntryId) teamIds.add(p.teamEntryId);
  }
  const teamMembersByTeamId = await fetchTeamMembersMapForTeamIds(opts.tx, [...teamIds]);
  return countCalledMarshalSlotsInHeat({
    heatMarshalCallClosed: opts.heatMarshalCallClosed,
    heat,
    statusByKey,
    teamMembersByTeamId,
  });
}

/**
 * ヒート確定（confirm-heat）時の「召集済み人数」検証用。
 * append 降順・マーシャル GET と同じ `countCalledMarshalSlotsInHeat` 定義に揃える。
 */
export async function countCalledMarshalSlotsForHeatConfirmInTransaction(opts: {
  tx: Prisma.TransactionClient;
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  snapshot: StartListSnapshotPayload | null;
  /** 同一トランザクション内で既に読んだ場合は渡す */
  statusRows?: ParticipantStatusRowForScope[];
}): Promise<number> {
  const roundData = getRoundDataFromSnapshot(opts.snapshot, opts.eventId, opts.round);
  const heat = getHeatFromRoundData(roundData, opts.heatIndex);
  if (!heat || !(heat.participants?.length)) return 0;

  const [marshalRow, statuses] = await Promise.all([
    opts.tx.competitionHeatMarshalState.findUnique({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId: opts.competitionId,
          eventId: opts.eventId,
          round: opts.round,
          heatIndex: opts.heatIndex,
        },
      },
      select: { callClosedAt: true },
    }),
    opts.statusRows
      ? Promise.resolve(opts.statusRows)
      : fetchParticipantStatusesForMarshalEvent(opts.tx, opts.competitionId, opts.eventId),
  ]);
  const heatMarshalCallClosed = Boolean(marshalRow?.callClosedAt);
  const statusByKey = buildParticipantMarshalDisplayByKeyForRound(statuses, opts.round);
  const teamIds = new Set<string>();
  for (const p of heat.participants ?? []) {
    if (p.kind === "TEAM" && p.teamEntryId) teamIds.add(p.teamEntryId);
  }
  const teamMembersByTeamId = await fetchTeamMembersMapForTeamIds(opts.tx, [...teamIds]);
  return countCalledMarshalSlotsInHeat({
    heatMarshalCallClosed,
    heat,
    statusByKey,
    teamMembersByTeamId,
  });
}
