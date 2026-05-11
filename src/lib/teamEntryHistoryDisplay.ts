/**
 * チームエントリー履歴カード用: 全 `teamName` がクラブ正式名（NFKC）で始まるときだけ、
 * プレフィックスを除いた接尾辞を「、」で連結して表示を短くする。省略時は `title` に全文を付ける。
 */
export function formatTeamNamesCompactByClubPrefix(
  clubName: string,
  teamNames: string[]
): { display: string; title?: string } {
  const trimmedNames = teamNames.map((t) => t.trim());
  const joined = trimmedNames.join("、");
  const prefix = clubName.trim();
  if (!prefix || trimmedNames.length === 0) {
    return { display: joined };
  }
  const pNorm = prefix.normalize("NFKC");
  const suffixes: string[] = [];
  for (const raw of trimmedNames) {
    const t = raw.normalize("NFKC");
    if (!t.startsWith(pNorm)) {
      return { display: joined };
    }
    const rest = t.slice(pNorm.length).trim();
    if (!rest) {
      return { display: joined };
    }
    suffixes.push(rest);
  }
  const display = suffixes.join("、");
  return display === joined ? { display: joined } : { display, title: joined };
}
