import type { ResultRound } from "@prisma/client";
import { marshalStatusKeyFromParts } from "@/lib/dayOpsParticipantKeys";

/** ラウンド横断で効く終了系（マーシャルラウンド別行より優先） */
const TERMINAL_DAY_OPS = new Set<string>(["DNS", "WITHDRAWN", "DSQ", "DNF"]);

export type ParticipantStatusRowForScope = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  /** チーム種目の構成員単位マーシャル */
  teamMemberUserId?: string | null;
  status: string;
  calledAt: Date | null;
  marshalRound: ResultRound;
  updatedAt: Date;
};

export function participantStatusKeyFromParts(
  participantType: string,
  competitionEntryId: string | null,
  teamEntryId: string | null,
  teamMemberUserId?: string | null
): string | null {
  return marshalStatusKeyFromParts(
    participantType,
    competitionEntryId,
    teamEntryId,
    teamMemberUserId
  );
}

/**
 * 同一参加者の複数行（marshalRound 別）から、表示・API 用の 1 つの状態を選ぶ。
 * 終了系はどのラウンド行でも種目全体として優先。それ以外は指定ラウンドの行のみ（無ければ PENDING）。
 */
export function pickParticipantStatusForRound(
  rows: ReadonlyArray<ParticipantStatusRowForScope>,
  round: ResultRound
): { status: string; calledAt: Date | null } {
  const sorted = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const terminal = sorted.find((r) => TERMINAL_DAY_OPS.has(r.status));
  if (terminal) {
    return { status: terminal.status, calledAt: terminal.calledAt };
  }
  const forRound = sorted.find((r) => r.marshalRound === round);
  if (forRound) {
    return { status: forRound.status, calledAt: forRound.calledAt };
  }
  return { status: "PENDING", calledAt: null };
}

export function buildParticipantMarshalDisplayByKeyForRound(
  rows: ReadonlyArray<ParticipantStatusRowForScope>,
  round: ResultRound
): Map<string, { status: string; calledAt: Date | null }> {
  const grouped = new Map<string, ParticipantStatusRowForScope[]>();
  for (const r of rows) {
    const k = participantStatusKeyFromParts(
      r.participantType,
      r.competitionEntryId,
      r.teamEntryId,
      r.teamMemberUserId
    );
    if (!k) continue;
    const list = grouped.get(k) ?? [];
    list.push(r);
    grouped.set(k, list);
  }
  const out = new Map<string, { status: string; calledAt: Date | null }>();
  for (const [k, list] of grouped) {
    out.set(k, pickParticipantStatusForRound(list, round));
  }
  return out;
}

export function buildParticipantStatusStringMapForRound(
  rows: ReadonlyArray<ParticipantStatusRowForScope>,
  round: ResultRound
): Map<string, string> {
  const m = buildParticipantMarshalDisplayByKeyForRound(rows, round);
  const out = new Map<string, string>();
  for (const [k, v] of m) {
    out.set(k, v.status);
  }
  return out;
}

export function buildParticipantStatusRecordForRound(
  rows: ReadonlyArray<ParticipantStatusRowForScope>,
  round: ResultRound
): Record<string, string> {
  const map = buildParticipantStatusStringMapForRound(rows, round);
  const rec: Record<string, string> = {};
  for (const [k, v] of map) {
    rec[k] = v;
  }
  return rec;
}
