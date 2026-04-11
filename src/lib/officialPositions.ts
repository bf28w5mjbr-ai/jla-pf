export type OfficialPositionRow = { positionName: string; count: number };

/**
 * Competition.officialPositions JSON を [{ positionName, count }] に正規化する。
 */
export function parseOfficialPositions(json: unknown): OfficialPositionRow[] {
  if (!Array.isArray(json)) return [];
  const out: OfficialPositionRow[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const o = row as { positionName?: unknown; count?: unknown };
    const positionName = typeof o.positionName === "string" ? o.positionName.trim() : "";
    const countRaw = o.count;
    const n =
      typeof countRaw === "number"
        ? countRaw
        : typeof countRaw === "string"
          ? parseInt(countRaw, 10)
          : NaN;
    if (!positionName || !Number.isFinite(n) || n < 1) continue;
    out.push({ positionName, count: Math.floor(n) });
  }
  return out;
}

export function isOfficialPositionChoice(
  positions: OfficialPositionRow[],
  choice: string
): boolean {
  const t = choice.trim();
  return positions.some((p) => p.positionName === t);
}
