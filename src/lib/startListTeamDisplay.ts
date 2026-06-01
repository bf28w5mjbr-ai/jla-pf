/**
 * スタートリストのチーム行で、メインのチーム名の横に括弧で付けるクラブ名。
 * チーム種目ではチーム名にクラブ識別が含まれるため常に null（括弧は出さない）。
 */
export function secondaryClubLabelForTeamRow(
  _teamName: string,
  _clubName: string | null | undefined
): string | null {
  return null;
}

/** 個人種目のスタートリスト行で、氏名の横に括弧付きで出す所属クラブ（未設定なら null） */
export function secondaryClubLineForIndividual(clubName: string | null | undefined): string | null {
  const c = (clubName ?? "").trim();
  return c || null;
}
