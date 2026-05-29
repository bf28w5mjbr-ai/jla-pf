import type { EventType } from "@prisma/client";
import type { StartListRoundData } from "@/lib/startListRounds";
import { normalizeSnapshotRoundKey } from "@/lib/heatMarshalFromSnapshot";
import type {
  StartListEventPageIndividual,
  StartListEventPageTeam,
} from "@/lib/startListEventTypes";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

/** 凍結ラウンドの先頭ヒートからユニーク参加者数を数える（公開表示用） */
export function countUniqueParticipantsInFrozenRounds(
  frozenSnapshotRounds: StartListRoundData[] | null | undefined,
  isTeam: boolean
): number {
  if (!frozenSnapshotRounds?.length) return 0;
  const heatRound =
    frozenSnapshotRounds.find((r) => normalizeSnapshotRoundKey(r.round) === "HEAT") ??
    frozenSnapshotRounds[0];
  if (!heatRound?.heats?.length) return 0;

  const ids = new Set<string>();
  for (const heat of heatRound.heats) {
    for (const p of heat.participants) {
      if (isTeam && p.kind === "TEAM" && p.teamEntryId) ids.add(p.teamEntryId);
      if (!isTeam && p.kind === "INDIVIDUAL" && p.entryId) ids.add(p.entryId);
    }
  }
  return ids.size;
}

/** スナップショット JSON から種目ごとの参加者数（HEAT ラウンド基準） */
export function entryCountByEventIdFromSnapshotData(
  data: unknown,
  events: ReadonlyArray<{ id: string; type: EventType }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    const frozen = extractFrozenRoundsForEventFromSnapshotData(data, e.id);
    out[e.id] = countUniqueParticipantsInFrozenRounds(frozen, e.type === "TEAM");
  }
  return out;
}

export async function fetchStartListEntryCountByEventIdFromSnapshot(
  competitionId: string,
  events: ReadonlyArray<{ id: string; type: EventType }>
): Promise<Record<string, number>> {
  if (events.length === 0) return {};
  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });
  return entryCountByEventIdFromSnapshotData(row?.data, events);
}

/** 公開閲覧: チーム種目のメンバー名だけ DB から補完（スナップショット上書き用） */
export async function loadPublicTeamLineupForEvent(
  competitionId: string,
  eventId: string
): Promise<StartListEventPageTeam[]> {
  const rows = await prisma.teamEntry.findMany({
    where: { competitionId, eventId },
    select: {
      id: true,
      teamName: true,
      club: { select: { id: true, name: true } },
      members: {
        orderBy: { order: "asc" },
        select: {
          user: { select: { profile: { select: { familyName: true, givenName: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    teamEntryId: row.id,
    teamName: row.teamName,
    clubId: row.club?.id ?? null,
    clubName: row.club?.name ?? null,
    members: row.members.map(
      (m) => `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim()
    ),
  }));
}

export const EMPTY_PUBLIC_LINEUP: {
  individuals: StartListEventPageIndividual[];
  teams: StartListEventPageTeam[];
} = {
  individuals: [],
  teams: [],
};
