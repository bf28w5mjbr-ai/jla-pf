export type StartListRefreshMeta = {
  capturedAtIso: string | null;
  teamMembersRevisionIso: string | null;
  officialResultsRevisionIso: string | null;
};

export function parseStartListRefreshMeta(data: unknown): StartListRefreshMeta {
  if (!data || typeof data !== "object") {
    return {
      capturedAtIso: null,
      teamMembersRevisionIso: null,
      officialResultsRevisionIso: null,
    };
  }
  const row = data as {
    capturedAtIso?: unknown;
    teamMembersRevisionIso?: unknown;
    officialResultsRevisionIso?: unknown;
  };
  return {
    capturedAtIso:
      typeof row.capturedAtIso === "string" || row.capturedAtIso === null
        ? row.capturedAtIso
        : null,
    teamMembersRevisionIso:
      typeof row.teamMembersRevisionIso === "string" || row.teamMembersRevisionIso === null
        ? row.teamMembersRevisionIso
        : null,
    officialResultsRevisionIso:
      typeof row.officialResultsRevisionIso === "string" ||
      row.officialResultsRevisionIso === null
        ? row.officialResultsRevisionIso
        : null,
  };
}

/**
 * 初回ポーリング（prev が null）はベースライン記録のみで refresh しない（現行挙動）。
 * 2 回目以降、いずれかの revision が変われば refresh。
 */
export function shouldRefreshStartListPage(
  prev: StartListRefreshMeta | null,
  next: StartListRefreshMeta
): boolean {
  if (prev === null) return false;
  return (
    prev.capturedAtIso !== next.capturedAtIso ||
    prev.teamMembersRevisionIso !== next.teamMembersRevisionIso ||
    prev.officialResultsRevisionIso !== next.officialResultsRevisionIso
  );
}
