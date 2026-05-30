import { cache } from "react";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import {
  getRoundDataFromSnapshot,
  listMarshalRoundsInSnapshotForEvent,
} from "@/lib/heatMarshalFromSnapshot";

const RESULT_ROUNDS = ["HEAT", "SEMI", "FINAL"] as const;

const loadSnapshotLooseCached = cache((competitionId: string) =>
  loadStartListSnapshotPayloadLoose(competitionId)
);

export type DsqManagementStatusRow = {
  id: string;
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  reason: string | null;
  label: string;
};

export type DsqManagementHeatRow = {
  heatIndex: number;
  participantCount: number;
};

export type DsqManagementPageData = {
  round: ResultRound;
  requestedRound: ResultRound;
  roundWasAdjusted: boolean;
  heats: DsqManagementHeatRow[];
  statuses: DsqManagementStatusRow[];
};

export function parseDsqManagementRoundParam(
  raw: string | null,
  fallback: ResultRound = "HEAT"
): ResultRound | null {
  if (!raw) return fallback;
  return (RESULT_ROUNDS as readonly string[]).includes(raw) ? (raw as ResultRound) : null;
}

async function attachDsqStatusLabels(
  competitionId: string,
  eventId: string,
  statuses: Array<{
    id: string;
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    status: string;
    reason: string | null;
  }>
): Promise<DsqManagementStatusRow[]> {
  if (statuses.length === 0) return [];

  const individualIds = [
    ...new Set(
      statuses
        .filter((s) => s.participantType === "INDIVIDUAL" && s.competitionEntryId)
        .map((s) => s.competitionEntryId as string)
    ),
  ];
  const teamIds = [
    ...new Set(
      statuses
        .filter((s) => s.participantType === "TEAM" && s.teamEntryId)
        .map((s) => s.teamEntryId as string)
    ),
  ];

  const [individualRows, teamRows] = await Promise.all([
    individualIds.length > 0
      ? prisma.competitionEntry.findMany({
          where: { id: { in: individualIds }, competitionId },
          select: {
            id: true,
            user: {
              select: { profile: { select: { familyName: true, givenName: true } } },
            },
          },
        })
      : Promise.resolve([]),
    teamIds.length > 0
      ? prisma.teamEntry.findMany({
          where: { id: { in: teamIds }, competitionId, eventId },
          select: { id: true, teamName: true },
        })
      : Promise.resolve([]),
  ]);

  const labelByEntryId = new Map(
    individualRows.map((e) => [
      e.id,
      `${e.user.profile?.familyName ?? ""} ${e.user.profile?.givenName ?? ""}`.trim() || e.id,
    ])
  );
  const labelByTeamId = new Map(teamRows.map((t) => [t.id, t.teamName]));

  return statuses.map((s) => {
    const label =
      s.participantType === "INDIVIDUAL" && s.competitionEntryId
        ? (labelByEntryId.get(s.competitionEntryId) ?? s.competitionEntryId)
        : s.participantType === "TEAM" && s.teamEntryId
          ? (labelByTeamId.get(s.teamEntryId) ?? s.teamEntryId)
          : "—";
    return {
      id: s.id,
      participantType: s.participantType,
      competitionEntryId: s.competitionEntryId,
      teamEntryId: s.teamEntryId,
      status: s.status,
      reason: s.reason,
      label,
    };
  });
}

/** 失格管理画面向け: スナップショットからヒート概要と DSQ 一覧を 1 回の DB ラウンドで取得 */
async function loadDsqManagementDataInner(
  competitionId: string,
  eventId: string,
  requestedRound: ResultRound
): Promise<DsqManagementPageData | null> {
  const [eventRow, snapshot, statuses] = await Promise.all([
    prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true },
    }),
    loadSnapshotLooseCached(competitionId),
    prisma.competitionParticipantStatus.findMany({
      where: { competitionId, eventId, status: "DSQ" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        participantType: true,
        competitionEntryId: true,
        teamEntryId: true,
        status: true,
        reason: true,
      },
    }),
  ]);

  if (!eventRow) return null;

  const labelsPromise = attachDsqStatusLabels(competitionId, eventId, statuses);

  const availableRounds = listMarshalRoundsInSnapshotForEvent(snapshot, eventId);
  let effectiveRound = requestedRound;
  let roundWasAdjusted = false;
  if (availableRounds.length > 0 && !availableRounds.includes(requestedRound)) {
    effectiveRound = availableRounds[0]!;
    roundWasAdjusted = true;
  }

  const roundData = getRoundDataFromSnapshot(snapshot, eventId, effectiveRound);
  const heats = [...(roundData?.heats ?? [])]
    .sort((a, b) => a.heatIndex - b.heatIndex)
    .map((h) => ({
      heatIndex: h.heatIndex,
      participantCount: (h.participants ?? []).length,
    }));

  const statusesWithLabels = await labelsPromise;

  return {
    round: effectiveRound,
    requestedRound,
    roundWasAdjusted,
    heats,
    statuses: statusesWithLabels,
  };
}

export const loadDsqManagementData = cache(loadDsqManagementDataInner);
