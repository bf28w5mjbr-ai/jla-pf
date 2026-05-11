/**
 * チームエントリー名の「クラブ略称（なければ正式名）」ベース。
 * {@link CompetitionTeamEntryManager} の自動命名と整合させる。
 */
export function clubTeamNameBaseFromClub(club: {
  abbreviation?: string | null;
  name: string;
}): string {
  const abbr = club.abbreviation?.trim();
  if (abbr) return abbr;
  return club.name.trim() || "チーム";
}

export function clubTeamNameBaseForClubId(
  clubId: string,
  clubs: { id: string; abbreviation?: string | null; name: string }[]
): string {
  const c = clubs.find((x) => x.id === clubId);
  return c ? clubTeamNameBaseFromClub(c) : "チーム";
}

/**
 * `teamName` が「ベース + 半角スペース + ラテン大文字のみの接尾辞」か。
 * 例: ベース「西浜」なら「西浜 A」「西浜 AA」は true。「西浜サーフ」は false。
 */
export function isClubBaseWithLetterSuffixTeamName(base: string, teamName: string): boolean {
  const b = base.trim();
  const t = teamName.trim();
  if (t === b) return false;
  if (!t.startsWith(`${b} `)) return false;
  const rest = t.slice(b.length + 1);
  return /^[A-Z]+$/.test(rest);
}

/**
 * 1組だけのとき、接尾辞付きの自動命名っぽい名前をベースだけに戻してよいか。
 * 略称があると {@link clubTeamNameBaseFromClub} は略称だけになるが、DB に「正式名称 A」が残っていることがあるため、
 * 略称・正式名の両方をベース候補に含めて判定する。
 */
export function shouldStripLetterSuffixForSingleTeam(
  club: { abbreviation?: string | null; name: string },
  teamName: string
): boolean {
  const candidates = new Set<string>();
  const abbr = club.abbreviation?.trim();
  const nameT = club.name.trim();
  if (abbr) candidates.add(abbr);
  if (nameT) candidates.add(nameT);
  candidates.add(clubTeamNameBaseFromClub(club));
  for (const base of candidates) {
    if (base && isClubBaseWithLetterSuffixTeamName(base, teamName)) return true;
  }
  return false;
}
