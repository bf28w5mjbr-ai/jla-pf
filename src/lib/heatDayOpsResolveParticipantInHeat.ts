import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  resolveMarshalSlotInHeat,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import { normalizeNfcTagId } from "@/lib/nfc/normalizeNfcTagId";

export type HeatDayOpsResolveBody =
  | {
      mode: "manual";
      participantType: "INDIVIDUAL" | "TEAM";
      competitionEntryId?: string;
      teamEntryId?: string;
      /** チーム種目の手動マーシャル時は必須（構成員） */
      teamMemberUserId?: string;
    }
  | { mode: "nfc"; nfcTagId: string };

export type HeatDayOpsResolvedSlot = {
  target: MarshalParticipantRef;
  slot: { lane: number; label: string; clubName: string | null };
};

/**
 * スタートリストスナップショット上で、指定ヒート内の参加者（手動 or NFC）を解決する。
 * マーシャル完了・リザルト取り込みなど当日運用で共通利用。
 */
export async function resolveParticipantInHeatForDayOps(opts: {
  competitionId: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  body: HeatDayOpsResolveBody;
}): Promise<
  | { ok: true; data: HeatDayOpsResolvedSlot }
  | { ok: false; status: number; error: string; errorCode?: string }
> {
  const { competitionId, eventId, round, heatIndex, body } = opts;
  const snapshot = await loadStartListSnapshotPayload(competitionId);
  const roundData = getRoundDataFromSnapshot(snapshot, eventId, round);
  const heat = getHeatFromRoundData(roundData, heatIndex);
  if (!heat) {
    return { ok: false, status: 400, error: "スタートリストに該当ヒートがありません" };
  }

  if (body.mode === "manual") {
    if (body.participantType === "INDIVIDUAL") {
      const target: MarshalParticipantRef = {
        participantType: "INDIVIDUAL",
        competitionEntryId: body.competitionEntryId ?? null,
        teamEntryId: null,
      };
      const resolved = resolveMarshalSlotInHeat(heat, target);
      if (!resolved) {
        return { ok: false, status: 400, error: "この参加者は選択したヒートに含まれていません" };
      }
      return { ok: true, data: { target, slot: resolved } };
    }

    const teamEntryId = body.teamEntryId ?? "";
    const teamMemberUserId = body.teamMemberUserId?.trim() ?? "";
    if (!teamEntryId || !teamMemberUserId) {
      return {
        ok: false,
        status: 400,
        error: "チーム種目は teamEntryId と teamMemberUserId（構成員）が必要です",
      };
    }

    const membership = await prisma.teamEntryMember.findFirst({
      where: {
        teamEntryId,
        userId: teamMemberUserId,
        teamEntry: { competitionId, eventId },
      },
      select: {
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
      },
    });
    if (!membership) {
      return {
        ok: false,
        status: 400,
        error: "このチームの割当構成員ではありません",
      };
    }

    const target: MarshalParticipantRef = {
      participantType: "TEAM",
      competitionEntryId: null,
      teamEntryId,
      teamMemberUserId,
      marshalDisplayLabel: `${membership.user.profile?.familyName ?? ""} ${membership.user.profile?.givenName ?? ""}`.trim(),
    };
    const resolved = resolveMarshalSlotInHeat(heat, target);
    if (!resolved) {
      return { ok: false, status: 400, error: "この参加者は選択したヒートに含まれていません" };
    }
    return { ok: true, data: { target, slot: resolved } };
  }

  const nfcTagId = normalizeNfcTagId(body.nfcTagId);
  const user = await prisma.user.findFirst({
    where: { nfcTag: { is: { nfcTagId } } },
    select: { id: true, profile: { select: { familyName: true, givenName: true } } },
  });
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: "NFCタグに紐付くユーザーがいません",
      errorCode: "NFC_TAG_UNBOUND",
    };
  }

  const displayLabel = `${user.profile?.familyName ?? ""} ${user.profile?.givenName ?? ""}`.trim();

  const [individualEntries, teamMembership] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId,
        userId: user.id,
        status: "SUBMITTED",
        items: { some: { eventId } },
      },
      select: { id: true },
    }),
    prisma.teamEntryMember.findFirst({
      where: {
        userId: user.id,
        teamEntry: { competitionId, eventId },
      },
      select: { teamEntryId: true },
    }),
  ]);

  let target: MarshalParticipantRef | null = null;

  const inHeatIndividual = individualEntries.find((entry) =>
    resolveMarshalSlotInHeat(heat, {
      participantType: "INDIVIDUAL",
      competitionEntryId: entry.id,
      teamEntryId: null,
    })
  );

  if (inHeatIndividual) {
    target = {
      participantType: "INDIVIDUAL",
      competitionEntryId: inHeatIndividual.id,
      teamEntryId: null,
    };
  } else if (teamMembership) {
    const tRef: MarshalParticipantRef = {
      participantType: "TEAM",
      competitionEntryId: null,
      teamEntryId: teamMembership.teamEntryId,
      teamMemberUserId: user.id,
      marshalDisplayLabel: displayLabel,
    };
    if (!resolveMarshalSlotInHeat(heat, tRef)) {
      target = null;
    } else {
      target = tRef;
    }
  }

  if (!target) {
    return {
      ok: false,
      status: 400,
      error: "かざした選手はこのヒートの参加者ではありません",
    };
  }

  const resolved = resolveMarshalSlotInHeat(heat, target);
  if (!resolved) {
    return { ok: false, status: 400, error: "ヒート内の位置を解決できませんでした" };
  }
  return { ok: true, data: { target, slot: resolved } };
}
