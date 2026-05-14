import { Prisma } from "@prisma/client";

/** ラウンド index（文字列キー）→ ISO 8601 開始日時 */
export type RoundScheduledStartsMap = Record<string, string>;

export function parseRoundScheduledStarts(raw: unknown): RoundScheduledStartsMap {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RoundScheduledStartsMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    if (!/^\d+$/.test(k)) continue;
    out[k] = t;
  }
  return out;
}

export function pruneRoundScheduledStarts(
  map: RoundScheduledStartsMap,
  maxRoundExclusive: number
): RoundScheduledStartsMap {
  const out: RoundScheduledStartsMap = {};
  for (const [k, v] of Object.entries(map)) {
    const i = Number.parseInt(k, 10);
    if (!Number.isInteger(i) || i < 0 || i >= maxRoundExclusive) continue;
    out[k] = v;
  }
  return out;
}

export function mergeRoundScheduledStart(
  prev: unknown,
  roundIndex: number,
  isoOrNull: string | null
): RoundScheduledStartsMap {
  const m = { ...parseRoundScheduledStarts(prev) };
  const key = String(roundIndex);
  if (isoOrNull === null || isoOrNull.trim() === "") {
    delete m[key];
    return m;
  }
  m[key] = isoOrNull.trim();
  return m;
}

export function roundStartKey(eventId: string, roundIndex: number): string {
  return `${eventId}:${roundIndex}`;
}

/** ラウンド別があればそれを、なければ第1ラウンドは scheduledStartAt を返す */
export function effectiveRoundStartIso(params: {
  scheduledStartAt: Date | string | null | undefined;
  roundScheduledStarts: unknown;
  roundIndex: number;
}): string | null {
  const { scheduledStartAt, roundScheduledStarts, roundIndex } = params;
  const map = parseRoundScheduledStarts(roundScheduledStarts);
  const fromMap = map[String(roundIndex)];
  if (fromMap) return fromMap;
  if (roundIndex === 0 && scheduledStartAt) {
    const t = new Date(scheduledStartAt).toISOString();
    return Number.isNaN(new Date(t).getTime()) ? null : t;
  }
  return null;
}

export function roundScheduledStartsToPrismaJson(
  map: RoundScheduledStartsMap
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return Object.keys(map).length > 0 ? (map as Prisma.InputJsonValue) : Prisma.JsonNull;
}
