import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";

/** ポーリング再取得で UI が変わらないとき setState を省略するための比較 */

export function marshalHeatsSemanticEqual(
  a: HeatMarshalHeatRow[] | null | undefined,
  b: HeatMarshalHeatRow[] | null | undefined
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const ha = left[i]!;
    const hb = right[i]!;
    if (ha.heatIndex !== hb.heatIndex) return false;
    if ((ha.callClosedAt ?? null) !== (hb.callClosedAt ?? null)) return false;
    if (ha.participants.length !== hb.participants.length) return false;
    for (let j = 0; j < ha.participants.length; j++) {
      const pa = ha.participants[j]!;
      const pb = hb.participants[j]!;
      if (
        pa.lane !== pb.lane ||
        pa.status !== pb.status ||
        pa.participantType !== pb.participantType ||
        pa.competitionEntryId !== pb.competitionEntryId ||
        pa.teamEntryId !== pb.teamEntryId ||
        (pa.teamMemberUserId ?? null) !== (pb.teamMemberUserId ?? null)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function resultCaptureRowsEqual(
  a: HeatResultCaptureRow[],
  b: HeatResultCaptureRow[]
): boolean {
  return resultCaptureSnapshotEqual(
    { rows: a, locked: false, confirmedHeats: [] },
    { rows: b, locked: false, confirmedHeats: [] }
  );
}

export function confirmedHeatsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function resultCaptureSnapshotEqual(
  a: {
    rows: HeatResultCaptureRow[];
    locked: boolean;
    confirmedHeats: number[];
  },
  b: {
    rows: HeatResultCaptureRow[];
    locked: boolean;
    confirmedHeats: number[];
  }
): boolean {
  if (a.locked !== b.locked) return false;
  if (a.confirmedHeats.length !== b.confirmedHeats.length) return false;
  for (let i = 0; i < a.confirmedHeats.length; i++) {
    if (a.confirmedHeats[i] !== b.confirmedHeats[i]) return false;
  }
  if (a.rows.length !== b.rows.length) return false;
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i]!;
    const rb = b.rows[i]!;
    if (
      ra.heat !== rb.heat ||
      ra.rank !== rb.rank ||
      ra.entryType !== rb.entryType ||
      ra.competitionEntryId !== rb.competitionEntryId ||
      ra.teamEntryId !== rb.teamEntryId ||
      ra.lane !== rb.lane ||
      Boolean(ra.advanceWithoutRank) !== Boolean(rb.advanceWithoutRank)
    ) {
      return false;
    }
  }
  return true;
}

export type ParticipantStatusPollRow = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  marshalRound: string;
  updatedAt: Date | string;
  teamMemberUserId?: string | null;
};

function participantPollRowKey(row: ParticipantStatusPollRow): string {
  const member =
    row.teamMemberUserId != null && row.teamMemberUserId !== ""
      ? `:${row.teamMemberUserId}`
      : "";
  return [
    row.marshalRound,
    row.participantType,
    row.competitionEntryId ?? "",
    row.teamEntryId ?? "",
    member,
  ].join("|");
}

export function participantStatusPollRowsEqual(
  a: ReadonlyArray<ParticipantStatusPollRow>,
  b: ReadonlyArray<ParticipantStatusPollRow>
): boolean {
  if (a.length !== b.length) return false;
  const mapA = new Map<string, ParticipantStatusPollRow>();
  for (const row of a) mapA.set(participantPollRowKey(row), row);
  for (const row of b) {
    const prev = mapA.get(participantPollRowKey(row));
    if (!prev) return false;
    if (prev.status !== row.status) return false;
    const ta =
      prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : new Date(prev.updatedAt).getTime();
    const tb =
      row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
    if (ta !== tb) return false;
  }
  return true;
}

/** heat-marshal 行の opKey → status（オーバーレイ適用後の比較用） */
export function marshalHeatStatusSignature(heats: HeatMarshalHeatRow[]): string {
  const parts: string[] = [];
  for (const h of heats) {
    for (const p of h.participants) {
      parts.push(`${h.heatIndex}:${marshalParticipantKey(p)}:${p.status}:${h.callClosedAt ?? ""}`);
    }
  }
  parts.sort();
  return parts.join("\n");
}
