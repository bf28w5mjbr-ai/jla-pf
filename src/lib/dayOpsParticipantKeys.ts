export type DayOpsParticipantType = "INDIVIDUAL" | "TEAM";

export function marshalIndividualKey(competitionEntryId: string): string {
  return `I:${competitionEntryId}`;
}

export function marshalTeamMemberKey(teamEntryId: string, teamMemberUserId: string): string {
  return `T:${teamEntryId}:${teamMemberUserId}`;
}

/** レガシー互換（メンバー未割当の TEAM 行など） */
export function marshalTeamLegacyKey(teamEntryId: string): string {
  return `T:${teamEntryId}`;
}

export function marshalStatusKeyFromParts(
  participantType: string,
  competitionEntryId: string | null,
  teamEntryId: string | null,
  teamMemberUserId?: string | null
): string | null {
  if (participantType === "INDIVIDUAL" && competitionEntryId) {
    return marshalIndividualKey(competitionEntryId);
  }
  if (participantType === "TEAM" && teamEntryId) {
    if (teamMemberUserId) {
      return marshalTeamMemberKey(teamEntryId, teamMemberUserId);
    }
    return marshalTeamLegacyKey(teamEntryId);
  }
  return null;
}

export function resultParticipantKeyFromParts(
  participantType: string,
  competitionEntryId: string | null,
  teamEntryId: string | null
): string | null {
  if (participantType === "INDIVIDUAL" && competitionEntryId) {
    return marshalIndividualKey(competitionEntryId);
  }
  if (participantType === "TEAM" && teamEntryId) {
    return marshalTeamLegacyKey(teamEntryId);
  }
  return null;
}

export function parseMarshalTeamMemberKey(key: string): {
  teamEntryId: string;
  teamMemberUserId: string;
} | null {
  if (!key.startsWith("T:")) return null;
  const parts = key.split(":");
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  return { teamEntryId: parts[1], teamMemberUserId: parts[2] };
}
