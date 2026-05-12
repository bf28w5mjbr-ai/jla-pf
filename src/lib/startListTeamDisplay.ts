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

/** 個人種目のスタートリスト行で、氏名の横に括弧付きで出す所属クラブ（未設定なら null） */
export function secondaryClubLineForIndividual(clubName: string | null | undefined): string | null {
  const c = (clubName ?? "").trim();
  return c || null;
}
