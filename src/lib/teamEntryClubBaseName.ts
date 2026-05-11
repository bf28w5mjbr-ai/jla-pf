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

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `teamName` が「ベース + 任意の空白（0文字以上）+ ラテン大文字のみの接尾辞」か。
 * 全クラブ共通。比較は **NFKC** で行い、全角英字・半角カナなどの表記ゆれを寄せてから判定する。
 * 接尾辞は NFKC 後に半角 A–Z のみ（全角 Ａ は NFKC で A になる）。
 */
export function isClubBaseWithLetterSuffixTeamName(base: string, teamName: string): boolean {
  const b = base.trim().normalize("NFKC");
  const t = teamName.trim().normalize("NFKC");
  if (!b || t === b) return false;
  const m = t.match(new RegExp(`^${escapeRegexChars(b)}\\s*([A-Z]+)$`));
  return Boolean(m?.[1]);
}

function addBaseStringVariants(raw: string | null | undefined, out: Set<string>) {
  const v = raw?.trim();
  if (!v) return;
  out.add(v);
  out.add(v.normalize("NFC"));
  out.add(v.normalize("NFKC"));
}

/**
 * 1組だけのとき、接尾辞付きの自動命名っぽい名前をベースだけに戻してよいか。
 * 略称・正式名・{@link clubTeamNameBaseFromClub} の結果に加え、それぞれの NFC / NFKC 表記をベース候補に含める
 *（クラブ名と `teamName` の微妙な表記差に対応）。
 */
export function shouldStripLetterSuffixForSingleTeam(
  club: { abbreviation?: string | null; name: string },
  teamName: string
): boolean {
  const candidates = new Set<string>();
  addBaseStringVariants(club.abbreviation, candidates);
  addBaseStringVariants(club.name, candidates);
  addBaseStringVariants(clubTeamNameBaseFromClub(club), candidates);
  for (const base of candidates) {
    if (base && isClubBaseWithLetterSuffixTeamName(base, teamName)) return true;
  }
  return false;
}
