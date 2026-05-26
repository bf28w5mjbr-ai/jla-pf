/** URL の `roundIndex` クエリ（0 始まり）をパースする */
export function parseRoundIndexSearchParam(raw: string | string[] | undefined): number | null {
  const value = typeof raw === "string" ? raw : undefined;
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
