/** 比較用（全角半角・連続空白の差で重複とみなさない） */
function normalizeTeamListLabel(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * スタートリストのチーム行で、メインのチーム名の横に括弧で付けるクラブ名。
 * チーム名と同じ内容なら重複になるため null（括弧は出さない）。
 */
export function secondaryClubLabelForTeamRow(
  teamName: string,
  clubName: string | null | undefined
): string | null {
  const c = (clubName ?? "").trim();
  if (!c) return null;
  if (normalizeTeamListLabel(c) === normalizeTeamListLabel(teamName)) return null;
  return c;
}
