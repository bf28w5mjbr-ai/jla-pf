import type { ResultRound } from "@prisma/client";
import { buildParticipantStatusStringMapForRound } from "@/lib/competitionParticipantStatusScope";
import { loadStartListSnapshotPayloadLoose, resolveParticipantMarshalHeat } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import { prisma } from "@/server/db";

/**
 * 次ラ進出の考え方（シンプル版）
 *
 * - マーシャル（召集チェック）済み = CALLED のみが「そのレースに参加した」扱い。
 * - マーシャルしていない選手は進出対象外（リザルトは CALLED のみ記録する API と整合）。
 * - 進出枠の総数は次ラの「ヒート数 × 最大レーン」（完走者数で総枠は削らない）。各前ラヒートへの配分はその総枠をヒート数で均等割り（マーシャル済み人数で枠を寄せない）。
 *   各ヒートで**公式結果に着順（rank）が入っている行だけ**を対象に、着順上位から枠数ぶん拾う（枠より rank 確定者が少なければその人数だけ）。rank 未入力の行で枠を埋めない。
 *
 * **UI との差**: スタートリストの「アップ」はレーン×次ラ構成からの理論按分。当日の「次ラ進出」表示は min(枠, 着順記録, 召集) の目安。ここでは DB の公式結果を正とする。
 * **重複行**: 同一参加者に OK 行が複数あるとヒート別集計で二重進出しうるため、{@link dedupeOfficialResultRowsForAdvance} で 1 行に潰してから按分する。
 *
 * **ヒート番号**: 公式行の `heat` が null のまま `row.heat ?? 0` で束ねるとヒート数が 1 になり、按分が [16] となって全着順から 16 人拾うバグになる。
 * {@link resolveOfficialRowHeatBucketKey} はスナップショット上のマーシャル所属を優先し、{@link groupOfficialRowsByResolvedHeatAndSnapshotOrder} で当該ラウンドのヒート数に揃える。
 */

const TERMINAL_DAY_OPS_STATUSES = new Set<string>(["DSQ", "DNS", "WITHDRAWN"]);

export type DedupeOfficialResultRowShape = {
  entryType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  rank: number | null;
  heat: number | null;
};

/**
 * 同一参加者（個人 entryId / チーム teamEntryId）に対する公式 OK 行が複数あるとき、
 * 進出按分の前に **1 行**にまとめる。着順が良い行を残し、同着は heat 番号が小さい行を残す（null heat は後回し）。
 */
export function dedupeOfficialResultRowsForAdvance<T extends DedupeOfficialResultRowShape>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key =
      row.entryType === "INDIVIDUAL" && row.competitionEntryId
        ? `I:${row.competitionEntryId}`
        : row.entryType === "TEAM" && row.teamEntryId
          ? `T:${row.teamEntryId}`
          : "";
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const rankOf = (r: T) =>
      typeof r.rank === "number" && Number.isFinite(r.rank) ? r.rank : Number.POSITIVE_INFINITY;
    const heatOf = (r: T) =>
      typeof r.heat === "number" && r.heat >= 1 ? r.heat : 10_000;

    const rp = rankOf(prev);
    const rc = rankOf(row);
    if (rc < rp) {
      byKey.set(key, row);
      continue;
    }
    if (rc > rp) continue;

    const hp = heatOf(prev);
    const hc = heatOf(row);
    if (hc < hp) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

export type AdvanceOfficialRowShape = {
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
  competitionEntry?: { id: string } | null;
  teamEntry?: { id: string } | null;
  heat: number | null;
};

/**
 * 次ラ按分用のヒート番号（1 始まり）。
 * スタートリスト上のマーシャル所属を **公式 heat より優先**する（リザルト行の heat 誤入力でバケットと CALLED 照合が食い違い、進出人数が落ちるのを防ぐ）。
 * スナップに載らない参加者のみ公式 `heat` を使う。
 */
export function resolveOfficialRowHeatBucketKey(
  row: AdvanceOfficialRowShape,
  snapshot: StartListSnapshotPayload | null,
  eventId: string,
  fromRound: ResultRound
): number | null {
  if (row.entryType === "INDIVIDUAL") {
    const id = row.competitionEntryId ?? row.competitionEntry?.id;
    if (id) {
      const m = resolveParticipantMarshalHeat(snapshot, eventId, fromRound, {
        participantType: "INDIVIDUAL",
        competitionEntryId: id,
        teamEntryId: null,
      });
      if (m != null && m >= 1) return m;
    }
  } else if (row.entryType === "TEAM") {
    const id = row.teamEntryId ?? row.teamEntry?.id;
    if (id) {
      const m = resolveParticipantMarshalHeat(snapshot, eventId, fromRound, {
        participantType: "TEAM",
        competitionEntryId: null,
        teamEntryId: id,
      });
      if (m != null && m >= 1) return m;
    }
  }
  if (typeof row.heat === "number" && row.heat >= 1) {
    return row.heat;
  }
  return null;
}

/**
 * 公式結果行を「真のヒート」別にまとめ、当該ラウンドのスナップショット上の heatIndex 順に並べる。
 * これで {@link computeAdvanceCountsByLaneSlotsPerHeat} の第1引数が「予選のヒート数」と一致する。
 */
export function groupOfficialRowsByResolvedHeatAndSnapshotOrder<T extends AdvanceOfficialRowShape>(
  rows: T[],
  snapshot: StartListSnapshotPayload | null,
  eventId: string,
  fromRound: ResultRound
): [number, T[]][] {
  const byHeat = new Map<number, T[]>();
  for (const row of rows) {
    const key = resolveOfficialRowHeatBucketKey(row, snapshot, eventId, fromRound);
    if (key == null || key < 1) continue;
    const list = byHeat.get(key) ?? [];
    list.push(row);
    byHeat.set(key, list);
  }

  const roundData = getRoundDataFromSnapshot(snapshot, eventId, fromRound);
  const orderedIndices =
    roundData?.heats?.length &&
    roundData.heats.every((h) => typeof h.heatIndex === "number" && h.heatIndex >= 1)
      ? [...roundData.heats].sort((a, b) => a.heatIndex - b.heatIndex).map((h) => h.heatIndex)
      : null;

  const seen = new Set<number>();
  const out: [number, T[]][] = [];
  if (orderedIndices?.length) {
    for (const idx of orderedIndices) {
      seen.add(idx);
      out.push([idx, byHeat.get(idx) ?? []]);
    }
  }
  for (const [k, list] of [...byHeat.entries()].sort((a, b) => a[0] - b[0])) {
    if (k < 1 || seen.has(k)) continue;
    out.push([k, list]);
  }
  if (out.length > 0) return out;
  return [...byHeat.entries()].sort((a, b) => a[0] - b[0]);
}

async function buildParticipantStatusByKeyForRound(
  competitionId: string,
  eventId: string,
  round: ResultRound
): Promise<Map<string, string>> {
  const allStatusRows = await prisma.competitionParticipantStatus.findMany({
    where: { competitionId, eventId },
    orderBy: { updatedAt: "desc" },
    select: {
      participantType: true,
      competitionEntryId: true,
      teamEntryId: true,
      status: true,
      marshalRound: true,
      updatedAt: true,
      calledAt: true,
    },
  });
  return buildParticipantStatusStringMapForRound(allStatusRows, round);
}

/**
 * 公式結果行が「当該ラウンドのレースに参加し、次ラ進出の候補になりうるか」。
 * 欠場・棄権・失格は除外。あとは CALLED かつスナップショット上のヒートが **按分バケットのヒート番号**（{@link resolveOfficialRowHeatBucketKey} と一致）であること。
 * `row.heat` 単体では照合しない（公式 heat の誤記で除外されないようにする）。
 */
export function isOfficialRowEligibleForNextRoundAdvance(
  row: AdvanceOfficialRowShape,
  heatBucketKey: number,
  fromRound: ResultRound,
  eventId: string,
  snapshot: StartListSnapshotPayload | null,
  latestStatusByKey: Map<string, string>
): boolean {
  const heat = heatBucketKey;
  if (row.entryType === "INDIVIDUAL") {
    const entryId = row.competitionEntryId ?? row.competitionEntry?.id;
    if (!entryId) return false;
    const key = `I:${entryId}`;
    const st = latestStatusByKey.get(key) ?? "PENDING";
    if (TERMINAL_DAY_OPS_STATUSES.has(st)) return false;
    if (st !== "CALLED") return false;
    const idx = resolveParticipantMarshalHeat(snapshot, eventId, fromRound, {
      participantType: "INDIVIDUAL",
      competitionEntryId: entryId,
      teamEntryId: null,
    });
    return idx != null && idx === heat;
  }
  const teamId = row.teamEntryId ?? row.teamEntry?.id;
  if (!teamId) return false;
  const key = `T:${teamId}`;
  const st = latestStatusByKey.get(key) ?? "PENDING";
  if (TERMINAL_DAY_OPS_STATUSES.has(st)) return false;
  if (st !== "CALLED") return false;
  const idx = resolveParticipantMarshalHeat(snapshot, eventId, fromRound, {
    participantType: "TEAM",
    competitionEntryId: null,
    teamEntryId: teamId,
  });
  return idx != null && idx === heat;
}

/** ヒート別の公式 OK 行から、マーシャル参加済みのみ残して次ラ按分の入力にする */
export async function filterHeatOfficialRowsForNextRoundAdvance<T extends AdvanceOfficialRowShape>(
  params: {
    competitionId: string;
    eventId: string;
    fromRound: ResultRound;
  },
  heatEntries: [heatKey: number, rows: T[]][]
): Promise<[heatKey: number, rows: T[]][]> {
  const [snapshot, latest] = await Promise.all([
    loadStartListSnapshotPayloadLoose(params.competitionId),
    buildParticipantStatusByKeyForRound(
      params.competitionId,
      params.eventId,
      params.fromRound
    ),
  ]);

  return heatEntries.map(([heatKey, rows]) => [
    heatKey,
    rows.filter((r) =>
      isOfficialRowEligibleForNextRoundAdvance(
        r,
        heatKey,
        params.fromRound,
        params.eventId,
        snapshot,
        latest
      )
    ),
  ]);
}
