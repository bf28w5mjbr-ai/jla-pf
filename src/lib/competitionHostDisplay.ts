/**
 * 大会に紐づく「主催としての表示名」は Competition にスナップショットされ、
 * 開催者 Organization のプロフィール名変更と連動しない。
 * 既存データ互換のため、未設定時は organization の現行値にフォールバックする。
 */

export function competitionHostDisplayName(c: {
  hostOrganizationName: string | null;
  organization: { name: string };
}): string {
  return c.hostOrganizationName ?? c.organization.name;
}

export function competitionHostAbbreviation(c: {
  hostOrganizationAbbreviation: string | null;
  organization: { abbreviation: string | null };
}): string | null {
  const a = c.hostOrganizationAbbreviation ?? c.organization.abbreviation;
  if (a == null || a.trim() === "") return null;
  return a.trim();
}
