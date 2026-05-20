/**
 * クラブ詳細「大会」タブ用: 大会ごとに、このクラブ紐づけでエントリーしたメンバーを集計する。
 */

export type ClubCompetitionRosterParticipant = {
  userId: string;
  displayName: string;
  detailLines: string[];
};

type IndividualRow = {
  competitionId: string;
  userId: string;
  user: { profile: { familyName: string; givenName: string } | null };
  items: { event: { name: string; type: string } }[];
};

type TeamRow = {
  competitionId: string;
  teamName: string;
  event: { name: string } | null;
  members: {
    userId: string;
    user: { profile: { familyName: string; givenName: string } | null };
  }[];
};

export function buildClubCompetitionRosterMap(
  individualEntries: IndividualRow[],
  teamEntries: TeamRow[]
): Map<string, ClubCompetitionRosterParticipant[]> {
  const byComp = new Map<string, Map<string, { displayName: string; lines: Set<string> }>>();

  function ensureUser(
    competitionId: string,
    userId: string,
    displayName: string
  ): { displayName: string; lines: Set<string> } {
    if (!byComp.has(competitionId)) {
      byComp.set(competitionId, new Map());
    }
    const inner = byComp.get(competitionId)!;
    let row = inner.get(userId);
    if (!row) {
      row = { displayName, lines: new Set<string>() };
      inner.set(userId, row);
    }
    return row;
  }

  for (const e of individualEntries) {
    const displayName = `${e.user.profile?.familyName ?? ""} ${e.user.profile?.givenName ?? ""}`.trim() || "（氏名未設定）";
    const indEvents = e.items
      .filter((i) => i.event.type === "INDIVIDUAL")
      .map((i) => i.event.name.trim())
      .filter(Boolean);
    const uniq = [...new Set(indEvents)];
    const line = uniq.length > 0 ? `個人: ${uniq.join("、")}` : "個人種目";
    const row = ensureUser(e.competitionId, e.userId, displayName);
    row.lines.add(line);
  }

  for (const te of teamEntries) {
    const eventLabel = te.event?.name?.trim() ?? "";
    for (const mem of te.members) {
      const displayName = `${mem.user.profile?.familyName ?? ""} ${mem.user.profile?.givenName ?? ""}`.trim() || "（氏名未設定）";
      const line = eventLabel
        ? `チーム「${te.teamName}」（${eventLabel}）`
        : `チーム「${te.teamName}」`;
      const row = ensureUser(te.competitionId, mem.userId, displayName);
      row.lines.add(line);
    }
  }

  const out = new Map<string, ClubCompetitionRosterParticipant[]>();
  for (const [competitionId, userMap] of byComp) {
    const list: ClubCompetitionRosterParticipant[] = [];
    for (const [userId, row] of userMap) {
      list.push({
        userId,
        displayName: row.displayName,
        detailLines: [...row.lines].sort((a, b) => a.localeCompare(b, "ja")),
      });
    }
    list.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
    out.set(competitionId, list);
  }
  return out;
}

const INDIVIDUAL_LINE = (l: string) =>
  l.startsWith("個人:") || l === "個人種目";
const TEAM_LINE = (l: string) => l.startsWith("チーム");

/** 出場メンバーを「個人エントリー」「チーム」向けに分割（同一ユーザーが両方にいる場合あり） */
export function splitRosterByEntryKind(roster: ClubCompetitionRosterParticipant[]): {
  individual: ClubCompetitionRosterParticipant[];
  team: ClubCompetitionRosterParticipant[];
} {
  const individual: ClubCompetitionRosterParticipant[] = [];
  const team: ClubCompetitionRosterParticipant[] = [];
  for (const p of roster) {
    const indLines = p.detailLines.filter(INDIVIDUAL_LINE);
    const teamLines = p.detailLines.filter(TEAM_LINE);
    if (indLines.length > 0) {
      individual.push({ ...p, detailLines: indLines });
    }
    if (teamLines.length > 0) {
      team.push({ ...p, detailLines: teamLines });
    }
  }
  return { individual, team };
}
