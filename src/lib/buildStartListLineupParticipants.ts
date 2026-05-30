import { shouldHideFromStartListLineupParticipantRow } from "@/lib/dayOpsParticipantStatusDisplay";
import { normalizeSnapshotRoundKey } from "@/lib/heatMarshalFromSnapshot";
import type { StartListRoundData } from "@/lib/startListRounds";
import type {
  StartListEventPageIndividual,
  StartListEventPageTeam,
} from "@/lib/startListEventTypes";
import { formatAssignableTeamMemberNames } from "@/lib/teamMemberSlots";

export type LineupParticipantStatusRow = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  reason: string | null;
};

export type LiveEntryForLineup = {
  id: string;
  userId: string;
  club: { id: string; name: string } | null;
  user: {
    profile: { familyName: string | null; givenName: string | null } | null;
  };
  items: ReadonlyArray<{ eventId: string }>;
};

export type LiveTeamEntryForLineup = {
  id: string;
  teamName: string;
  club: { id: string; name: string } | null;
  members: ReadonlyArray<{
    role?: string | null;
    user: {
      profile: { familyName: string | null; givenName: string | null } | null;
    };
  }>;
};

function collectExcludedEntryIds(
  participantStatusRows: ReadonlyArray<LineupParticipantStatusRow>,
  participantType: "INDIVIDUAL" | "TEAM",
  idField: "competitionEntryId" | "teamEntryId"
): Set<string> {
  const rowsById = new Map<string, LineupParticipantStatusRow[]>();
  for (const row of participantStatusRows) {
    if (row.participantType !== participantType) continue;
    const id = row[idField];
    if (!id) continue;
    if (!rowsById.has(id)) rowsById.set(id, []);
    rowsById.get(id)!.push(row);
  }
  const excluded = new Set<string>();
  for (const [entryId, rows] of rowsById) {
    if (
      rows.some((r) =>
        shouldHideFromStartListLineupParticipantRow({ status: r.status, reason: r.reason })
      )
    ) {
      excluded.add(entryId);
    }
  }
  return excluded;
}

export function buildStartListLineupFromEntries(input: {
  liveEntries: ReadonlyArray<LiveEntryForLineup>;
  liveTeamEntries: ReadonlyArray<LiveTeamEntryForLineup>;
  participantStatusRows: ReadonlyArray<LineupParticipantStatusRow>;
}): {
  individuals: StartListEventPageIndividual[];
  teams: StartListEventPageTeam[];
  placementIndividualIds: string[];
  placementTeamIds: string[];
} {
  const { liveEntries, liveTeamEntries, participantStatusRows } = input;

  const excludedIndividualEntryIds = collectExcludedEntryIds(
    participantStatusRows,
    "INDIVIDUAL",
    "competitionEntryId"
  );
  const excludedTeamEntryIds = collectExcludedEntryIds(
    participantStatusRows,
    "TEAM",
    "teamEntryId"
  );

  const individuals: StartListEventPageIndividual[] = [];
  const placementIndividualIds: string[] = [];
  for (const entry of liveEntries) {
    if (excludedIndividualEntryIds.has(entry.id)) continue;
    const item = entry.items[0];
    if (!item) continue;
    placementIndividualIds.push(entry.id);
    individuals.push({
      entryId: entry.id,
      userId: entry.userId,
      name: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
      clubId: entry.club?.id ?? null,
      clubName: entry.club?.name ?? null,
    });
  }
  placementIndividualIds.sort();

  const teams: StartListEventPageTeam[] = [];
  const placementTeamIds: string[] = [];
  for (const teamEntry of liveTeamEntries) {
    if (excludedTeamEntryIds.has(teamEntry.id)) continue;
    placementTeamIds.push(teamEntry.id);
    teams.push({
      teamEntryId: teamEntry.id,
      teamName: teamEntry.teamName,
      clubId: teamEntry.club?.id ?? null,
      clubName: teamEntry.club?.name ?? null,
      members: formatAssignableTeamMemberNames(teamEntry.members),
    });
  }
  placementTeamIds.sort();

  return { individuals, teams, placementIndividualIds, placementTeamIds };
}

function teamMembersFromLiveEntry(
  teamEntry: LiveTeamEntryForLineup
): StartListEventPageTeam {
  return {
    teamEntryId: teamEntry.id,
    teamName: teamEntry.teamName,
    clubId: teamEntry.club?.id ?? null,
    clubName: teamEntry.club?.name ?? null,
    members: formatAssignableTeamMemberNames(teamEntry.members),
  };
}

/**
 * 凍結スナップショット由来の teams に、DB の最新メンバー割当を反映する。
 * スナップショット未更新でもスタートリスト上のメンバー名が追従する。
 */
export function overlayLiveTeamMembersFromDb(
  teams: ReadonlyArray<StartListEventPageTeam>,
  liveTeamEntries: ReadonlyArray<LiveTeamEntryForLineup>
): StartListEventPageTeam[] {
  if (liveTeamEntries.length === 0) return [...teams];

  const dbById = new Map(
    liveTeamEntries.map((entry) => [entry.id, teamMembersFromLiveEntry(entry)])
  );
  const seen = new Set<string>();
  const merged = teams.map((team) => {
    seen.add(team.teamEntryId);
    const db = dbById.get(team.teamEntryId);
    return db
      ? {
          ...team,
          members: db.members.length > 0 ? db.members : team.members,
        }
      : team;
  });
  for (const [id, dbTeam] of dbById) {
    if (!seen.has(id) && dbTeam.members.length > 0) merged.push(dbTeam);
  }
  return merged;
}

/**
 * ステップ1確定後のスナップショットから出場者一覧を組み立てる（ライブエントリー全件取得を省略）。
 */
export function buildStartListLineupFromFrozenRounds(input: {
  frozenSnapshotRounds: ReadonlyArray<StartListRoundData>;
  isTeam: boolean;
  participantStatusRows: ReadonlyArray<LineupParticipantStatusRow>;
}): {
  individuals: StartListEventPageIndividual[];
  teams: StartListEventPageTeam[];
  placementIndividualIds: string[];
  placementTeamIds: string[];
} | null {
  const heatRound =
    input.frozenSnapshotRounds.find((r) => normalizeSnapshotRoundKey(r.round) === "HEAT") ??
    input.frozenSnapshotRounds[0];
  if (!heatRound?.heats?.length) return null;

  const excludedIndividualEntryIds = collectExcludedEntryIds(
    input.participantStatusRows,
    "INDIVIDUAL",
    "competitionEntryId"
  );
  const excludedTeamEntryIds = collectExcludedEntryIds(
    input.participantStatusRows,
    "TEAM",
    "teamEntryId"
  );

  const seenIndividuals = new Map<string, StartListEventPageIndividual>();
  const seenTeams = new Map<string, StartListEventPageTeam>();

  for (const heat of heatRound.heats) {
    for (const p of heat.participants) {
      if (input.isTeam && p.kind === "TEAM") {
        if (!p.teamEntryId || excludedTeamEntryIds.has(p.teamEntryId)) continue;
        if (seenTeams.has(p.teamEntryId)) continue;
        seenTeams.set(p.teamEntryId, {
          teamEntryId: p.teamEntryId,
          teamName: p.teamName,
          clubId: p.clubId ?? null,
          clubName: p.clubName ?? null,
          members: [...(p.members ?? [])],
        });
      } else if (!input.isTeam && p.kind === "INDIVIDUAL") {
        if (!p.entryId || excludedIndividualEntryIds.has(p.entryId)) continue;
        if (seenIndividuals.has(p.entryId)) continue;
        seenIndividuals.set(p.entryId, {
          entryId: p.entryId,
          userId: p.userId,
          name: p.name,
          clubId: p.clubId ?? null,
          clubName: p.clubName ?? null,
        });
      }
    }
  }

  if (seenIndividuals.size === 0 && seenTeams.size === 0) return null;

  const placementIndividualIds = [...seenIndividuals.keys()].sort();
  const placementTeamIds = [...seenTeams.keys()].sort();
  return {
    individuals: [...seenIndividuals.values()],
    teams: [...seenTeams.values()],
    placementIndividualIds,
    placementTeamIds,
  };
}
