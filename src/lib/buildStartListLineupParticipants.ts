import { shouldHideFromStartListLineupParticipantRow } from "@/lib/dayOpsParticipantStatusDisplay";
import type {
  StartListEventPageIndividual,
  StartListEventPageTeam,
} from "@/lib/startListEventTypes";

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
      members: teamEntry.members
        .map(
          (member) =>
            `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim()
        )
        .filter(Boolean),
    });
  }
  placementTeamIds.sort();

  return { individuals, teams, placementIndividualIds, placementTeamIds };
}
