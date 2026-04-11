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

/**
 * スタートリスト上でチームが配置される各ラウンドについて、いずれかのヒートで召集締切済みなら true。
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

  for (const te of teamEntries) {
    ref.teamEntryId = te.id;
    const rounds = listMarshalRoundsInSnapshotForEvent(snapshot, te.eventId);
    let blocked = false;
    for (const round of rounds) {
      const heatIndex = resolveParticipantMarshalHeat(
        snapshot,
        te.eventId,
        round as ResultRound,
        ref
      );
      if (heatIndex == null) continue;
      if (closedSet.has(`${te.eventId}:${round}:${heatIndex}`)) {
        blocked = true;
        break;
      }
    }
    out.set(te.id, blocked);
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
