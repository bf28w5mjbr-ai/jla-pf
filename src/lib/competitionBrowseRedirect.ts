/** `/competitions/[segment]` で詳細リダイレクトの対象外とする単一セグメント */
const COMPETITIONS_RESERVED_SINGLE_SEGMENTS = new Set(["view", "create"]);

/**
 * 大会一覧・詳細の公開 URL と会員 URL の振り分け。
 * 子パス（entry, start-list 等）は対象外。
 */
export function getCompetitionBrowseRedirect(
  pathname: string,
  search: string,
  isLoggedIn: boolean
): string | null {
  if (pathname === "/browse/competitions") {
    return isLoggedIn ? `/competitions${search}` : null;
  }

  const viewMatch = pathname.match(/^\/competitions\/view\/([^/]+)$/);
  if (viewMatch) {
    return isLoggedIn ? `/competitions/${viewMatch[1]}${search}` : null;
  }

  if (pathname === "/competitions") {
    return isLoggedIn ? null : `/browse/competitions${search}`;
  }

  const detailMatch = pathname.match(/^\/competitions\/([^/]+)$/);
  if (detailMatch) {
    const segment = detailMatch[1];
    if (COMPETITIONS_RESERVED_SINGLE_SEGMENTS.has(segment)) {
      return null;
    }
    return isLoggedIn ? null : `/competitions/view/${segment}${search}`;
  }

  return null;
}
