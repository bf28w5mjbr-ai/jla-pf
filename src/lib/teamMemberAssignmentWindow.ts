import type { PrismaClient } from "@prisma/client";
import type { ResultRound } from "@prisma/client";
import {
  loadStartListSnapshotPayloadLoose,
  resolveParticipantMarshalHeat,
} from "@/lib/heatMarshalGate";
import {
  listMarshalRoundsInSnapshotForEvent,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import { resolveTeamAssignmentDeadline } from "@/lib/startListSettings";

export type LatestTeamMarshalPlacement = {
  latestRound: ResultRound | null;
  latestHeatIndex: number | null;
};

/** スナップショット上で最も進んだラウンド（HEAT → SEMI → FINAL）の配置を返す */
export function resolveLatestTeamMarshalPlacement(params: {
  roundsInSnapshotOrder: readonly ResultRound[];
  resolveHeatIndex: (round: ResultRound) => number | null | undefined;
}): LatestTeamMarshalPlacement {
  let latestRound: ResultRound | null = null;
  let latestHeatIndex: number | null = null;

  for (const round of params.roundsInSnapshotOrder) {
    const heatIndex = params.resolveHeatIndex(round);
    if (heatIndex == null) continue;
    latestRound = round;
    latestHeatIndex = heatIndex;
  }

  return { latestRound, latestHeatIndex };
}

/**
 * スナップショット上で最も進んだラウンド（HEAT → SEMI → FINAL のうち最後に配置がある）の
 * ヒートだけを見る。予選のマーシャル締切後も、決勝枠向けにメンバー割当を直せるようにする。
 */
export function isTeamEntryMarshalAssignmentBlockedForLatestPlacement(params: {
  eventId: string;
  roundsInSnapshotOrder: readonly ResultRound[];
  resolveHeatIndex: (round: ResultRound) => number | null | undefined;
  closedMarshalHeatKeys: ReadonlySet<string>;
}): boolean {
  const { latestRound, latestHeatIndex } = resolveLatestTeamMarshalPlacement(params);

  if (latestRound == null || latestHeatIndex == null) {
    return false;
  }

  return params.closedMarshalHeatKeys.has(
    `${params.eventId}:${latestRound}:${latestHeatIndex}`
  );
}

/**
 * スタートリスト上の「いま向き合っている」ヒート（最進ラウンドの配置）でマーシャル締切済みなら true。
 * スナップショットに未掲載のチームはブロックしない（ヒート確定前）。
 */
export async function getTeamEntryMarshalAssignmentBlockedMap(
  prisma: Pick<PrismaClient, "competitionHeatMarshalState">,
  competitionId: string,
  teamEntries: { id: string; eventId: string }[]
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (teamEntries.length === 0) return out;

  const snapshot = await loadStartListSnapshotPayloadLoose(competitionId);
  const eventIds = [...new Set(teamEntries.map((t) => t.eventId))];

  const closedRows = await prisma.competitionHeatMarshalState.findMany({
    where: {
      competitionId,
      callClosedAt: { not: null },
      eventId: { in: eventIds },
    },
    select: { eventId: true, round: true, heatIndex: true },
  });
  const closedSet = new Set(
    closedRows.map((r) => `${r.eventId}:${r.round}:${r.heatIndex}`)
  );

  const ref: MarshalParticipantRef = {
    participantType: "TEAM",
    competitionEntryId: null,
    teamEntryId: "",
  };

  type BlockedCandidate = {
    teamEntryId: string;
    eventId: string;
    fromRound: ResultRound;
  };
  const blockedCandidates: BlockedCandidate[] = [];

  for (const te of teamEntries) {
    ref.teamEntryId = te.id;
    const rounds = listMarshalRoundsInSnapshotForEvent(snapshot, te.eventId);
    const placement = resolveLatestTeamMarshalPlacement({
      roundsInSnapshotOrder: rounds,
      resolveHeatIndex: (round) =>
        resolveParticipantMarshalHeat(snapshot, te.eventId, round, ref),
    });
    const blocked =
      placement.latestRound != null &&
      placement.latestHeatIndex != null &&
      closedSet.has(`${te.eventId}:${placement.latestRound}:${placement.latestHeatIndex}`);

    out.set(te.id, blocked);
    if (
      blocked &&
      placement.latestRound != null &&
      placement.latestRound !== "FINAL"
    ) {
      blockedCandidates.push({
        teamEntryId: te.id,
        eventId: te.eventId,
        fromRound: placement.latestRound,
      });
    }
  }

  if (blockedCandidates.length > 0) {
    const advanceIdsByKey = new Map<string, Set<string>>();
    for (const candidate of blockedCandidates) {
      const key = `${candidate.eventId}:${candidate.fromRound}`;
      if (!advanceIdsByKey.has(key)) {
        const { teamEntryIdsSelectedForNextRoundAdvanceFromOfficial } = await import(
          "@/lib/startListNextRoundFromOfficial"
        );
        advanceIdsByKey.set(
          key,
          await teamEntryIdsSelectedForNextRoundAdvanceFromOfficial({
            competitionId,
            eventId: candidate.eventId,
            fromRound: candidate.fromRound,
          })
        );
      }
      if (advanceIdsByKey.get(key)!.has(candidate.teamEntryId)) {
        out.set(candidate.teamEntryId, false);
      }
    }
  }

  return out;
}

export type TeamMemberAssignmentWindowState = {
  /** エントリー終了後（マーシャルはチームごとに {@link getTeamEntryMarshalAssignmentBlockedMap}） */
  open: boolean;
  /** スタートリスト設定の目安日時（通知用。編集可否の上限には使わない） */
  deadline: Date | null;
  deadlineLabel: string;
  /** 互換のため常に false（マーシャルはヒート単位で判定） */
  closedByMarshal: boolean;
  /** @deprecated {@link afterEntryEnd} を使用 */
  withinScheduledWindow: boolean;
  afterEntryEnd: boolean;
};

/**
 * チームメンバー割当の「期間」はエントリー終了後から（目安日時は通知のみ）。
 * 編集可否の確定は {@link getTeamEntryMarshalAssignmentBlockedMap} で自チームのヒートのマーシャル締切を見る。
 */
export async function getTeamMemberAssignmentWindowState(
  _prisma: Pick<PrismaClient, "competitionHeatMarshalState">,
  _competitionId: string,
  competition: {
    entryEndDate: Date | null;
    startListSettings: unknown;
    startDate: Date;
  },
  now: Date = new Date()
): Promise<TeamMemberAssignmentWindowState> {
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const notificationDeadline = resolveTeamAssignmentDeadline(
    competition.startListSettings,
    competition.startDate
  );
  const afterEntryEnd = entryEnd !== null && now > entryEnd;
  const open = afterEntryEnd;

  const deadlineLabel = notificationDeadline
    ? `${notificationDeadline.toLocaleString("ja-JP")}（目安・通知用）`
    : "未設定（大会開始日などが目安として使われる場合があります）";

  return {
    open,
    deadline: notificationDeadline,
    deadlineLabel,
    closedByMarshal: false,
    withinScheduledWindow: afterEntryEnd,
    afterEntryEnd,
  };
}
