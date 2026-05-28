import type { ResultRound } from "@prisma/client";
import type { StartListHeat, StartListRound, StartListRoundData } from "@/lib/startListRounds";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";
import { marshalIndividualKey, marshalTeamLegacyKey } from "@/lib/dayOpsParticipantKeys";

export type MarshalParticipantRef = {
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
  /** チーム種目: 構成員ユーザー。DB の CompetitionParticipantStatus と対応 */
  teamMemberUserId?: string | null;
  /** 解決時の表示用（氏名）。未設定ならチーム名のみ */
  marshalDisplayLabel?: string | null;
};

export function parseStartListSnapshotForMarshal(data: unknown): StartListSnapshotPayload | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { version?: unknown; events?: unknown };
  if (o.version !== 1 || !Array.isArray(o.events)) return null;
  return data as StartListSnapshotPayload;
}

/** 次ラ自動生成など: version が 1 以外でも events があればラウンド／ヒート構造だけ読む */
export function parseStartListSnapshotLooseForRoundRead(data: unknown): StartListSnapshotPayload | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { events?: unknown };
  if (!Array.isArray(o.events)) return null;
  return data as StartListSnapshotPayload;
}

const SNAPSHOT_ROUND_ORDER: readonly StartListRound[] = ["HEAT", "SEMI", "FINAL"];

/** JSON 由来の round 文字列を ResultRound に寄せる（大文字小文字のゆれ対策） */
export function normalizeSnapshotRoundKey(raw: unknown): StartListRound | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase();
  if (u === "HEAT" || u === "SEMI" || u === "FINAL") return u;
  return null;
}

/**
 * スタートリストスナップショットに実際に含まれる `round` キーだけを、並び順で返す。
 * 値は DB 上の ResultRound（最大3種）であり、タブ位置から付く **内部識別子** であり、
 * 競技用語の「予選／準決勝／決勝」とは一致しない場合がある（2タブは HEAT+FINAL 等）。
 * 空配列は当該種目にスナップショットラウンドが無い場合。
 */
export function listMarshalRoundsInSnapshotForEvent(
  payload: StartListSnapshotPayload | null,
  eventId: string
): StartListRound[] {
  if (!payload?.events) return [];
  const ev = payload.events.find((e) => e.eventId === eventId);
  if (!ev?.rounds?.length) return [];
  const present = new Set<StartListRound>();
  for (const r of ev.rounds) {
    const k = normalizeSnapshotRoundKey(r.round);
    if (k) present.add(k);
  }
  return SNAPSHOT_ROUND_ORDER.filter((x) => present.has(x));
}

export function getRoundDataFromSnapshot(
  payload: StartListSnapshotPayload | null,
  eventId: string,
  round: ResultRound
): StartListRoundData | undefined {
  if (!payload?.events) return undefined;
  const ev = payload.events.find((e) => e.eventId === eventId);
  if (!ev?.rounds) return undefined;
  return ev.rounds.find((r) => normalizeSnapshotRoundKey(r.round) === round);
}

/** スナップショット JSON に種目ブロックが存在するか（rounds が空でも true） */
export function isEventPresentInSnapshot(
  payload: StartListSnapshotPayload | null,
  eventId: string
): boolean {
  return Boolean(payload?.events?.some((e) => e.eventId === eventId));
}

export function findHeatIndexInRound(
  roundData: StartListRoundData | undefined,
  participant: MarshalParticipantRef
): number | null {
  if (!roundData) return null;
  const heats = roundData.heats ?? [];
  for (const heat of heats) {
    for (const p of heat.participants) {
      if (participant.participantType === "INDIVIDUAL" && p.kind === "INDIVIDUAL") {
        if (p.entryId === participant.competitionEntryId) return heat.heatIndex;
      }
      if (participant.participantType === "TEAM" && p.kind === "TEAM") {
        if (p.teamEntryId === participant.teamEntryId) return heat.heatIndex;
      }
    }
  }
  return null;
}

export function getHeatFromRoundData(
  roundData: StartListRoundData | undefined,
  heatIndex: number
): StartListHeat | undefined {
  return (roundData?.heats ?? []).find((h) => h.heatIndex === heatIndex);
}

/** ヒート内の並び順をレーン番号（1始まり）として扱う */
export function resolveMarshalSlotInHeat(
  heat: StartListHeat | undefined,
  ref: MarshalParticipantRef
): { lane: number; label: string; clubName: string | null } | null {
  if (!heat) return null;
  const participants = heat.participants ?? [];
  for (let i = 0; i < participants.length; i += 1) {
    const p = participants[i];
    if (ref.participantType === "INDIVIDUAL" && p.kind === "INDIVIDUAL") {
      if (p.entryId === ref.competitionEntryId) {
        return { lane: i + 1, label: p.name, clubName: p.clubName };
      }
    }
    if (ref.participantType === "TEAM" && p.kind === "TEAM") {
      if (p.teamEntryId === ref.teamEntryId) {
        const memberLabel = ref.marshalDisplayLabel?.trim();
        const label =
          memberLabel && memberLabel.length > 0
            ? `${p.teamName}（${memberLabel}）`
            : p.teamName;
        return { lane: i + 1, label, clubName: p.clubName };
      }
    }
  }
  return null;
}

/** スナップショット上のレーン番号（1始まり）にいる参加者を参照に変換する */
export function marshalParticipantRefAtLane(
  heat: StartListHeat | undefined,
  lane1Based: number
): MarshalParticipantRef | null {
  if (!heat?.participants?.length) return null;
  const i = lane1Based - 1;
  if (i < 0 || i >= heat.participants.length) return null;
  const p = heat.participants[i];
  if (p.kind === "INDIVIDUAL") {
    if (!p.entryId) return null;
    return {
      participantType: "INDIVIDUAL",
      competitionEntryId: p.entryId,
      teamEntryId: null,
    };
  }
  if (!p.teamEntryId) return null;
  return {
    participantType: "TEAM",
    competitionEntryId: null,
    teamEntryId: p.teamEntryId,
  };
}

/**
 * 自動失格（マーシャル締切など）用: スナップショット上の参加者参照を列挙。
 * `heatIndex` を指定するとそのヒートのみ、未指定なら当該ラウンドの全ヒート（重複は除く）。
 */
export function marshalParticipantRefsForAutoDsq(
  roundData: StartListRoundData | undefined,
  heatIndexFilter: number | null | undefined
): MarshalParticipantRef[] {
  const byKey = new Map<string, MarshalParticipantRef>();
  const heats =
    heatIndexFilter != null
      ? (() => {
          const h = getHeatFromRoundData(roundData, heatIndexFilter);
          return h ? [h] : [];
        })()
      : (roundData?.heats ?? []);

  for (const heat of heats) {
    for (const p of heat.participants ?? []) {
      if (p.kind === "INDIVIDUAL" && p.entryId) {
        const k = marshalIndividualKey(p.entryId);
        if (!byKey.has(k)) {
          byKey.set(k, {
            participantType: "INDIVIDUAL",
            competitionEntryId: p.entryId,
            teamEntryId: null,
          });
        }
      } else if (p.kind === "TEAM" && p.teamEntryId) {
        const k = marshalTeamLegacyKey(p.teamEntryId);
        if (!byKey.has(k)) {
          byKey.set(k, {
            participantType: "TEAM",
            competitionEntryId: null,
            teamEntryId: p.teamEntryId,
          });
        }
      }
    }
  }
  return [...byKey.values()];
}
