import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import type { ResultRound } from "@prisma/client";

export type DayOpsStartListSessionCacheKey = {
  competitionId: string;
  eventId: string;
  round: ResultRound;
};

export type MarshalSessionCacheEntry = {
  heats: HeatMarshalHeatRow[];
  hasParticipants: boolean;
};

export type ResultCaptureSessionCacheEntry = {
  rows: HeatResultCaptureRow[];
  locked: boolean;
  confirmedHeats: number[];
};

function cacheKey({ competitionId, eventId, round }: DayOpsStartListSessionCacheKey): string {
  return `${competitionId}:${eventId}:${round}`;
}

const marshalByKey = new Map<string, MarshalSessionCacheEntry>();
const resultCaptureByKey = new Map<string, ResultCaptureSessionCacheEntry>();

export function getMarshalSessionCache(
  key: DayOpsStartListSessionCacheKey
): MarshalSessionCacheEntry | undefined {
  return marshalByKey.get(cacheKey(key));
}

export function setMarshalSessionCache(
  key: DayOpsStartListSessionCacheKey,
  entry: MarshalSessionCacheEntry
): void {
  marshalByKey.set(cacheKey(key), entry);
}

export function getResultCaptureSessionCache(
  key: DayOpsStartListSessionCacheKey
): ResultCaptureSessionCacheEntry | undefined {
  return resultCaptureByKey.get(cacheKey(key));
}

export function setResultCaptureSessionCache(
  key: DayOpsStartListSessionCacheKey,
  entry: ResultCaptureSessionCacheEntry
): void {
  resultCaptureByKey.set(cacheKey(key), entry);
}

function eventPrefix(competitionId: string, eventId: string): string {
  return `${competitionId}:${eventId}:`;
}

/** 種目単位で marshal キャッシュのみ削除 */
export function invalidateMarshalSessionCacheForEvent(
  competitionId: string,
  eventId: string
): void {
  const prefix = eventPrefix(competitionId, eventId);
  for (const k of marshalByKey.keys()) {
    if (k.startsWith(prefix)) marshalByKey.delete(k);
  }
}

/** 種目単位で result capture キャッシュのみ削除 */
export function invalidateResultCaptureSessionCacheForEvent(
  competitionId: string,
  eventId: string
): void {
  const prefix = eventPrefix(competitionId, eventId);
  for (const k of resultCaptureByKey.keys()) {
    if (k.startsWith(prefix)) resultCaptureByKey.delete(k);
  }
}

/** ラウンド単位で result capture キャッシュのみ削除 */
export function invalidateResultCaptureSessionCacheForRound(
  key: DayOpsStartListSessionCacheKey
): void {
  resultCaptureByKey.delete(cacheKey(key));
}

/** 種目単位で marshal / result capture キャッシュを削除 */
export function invalidateDayOpsStartListSessionCacheForEvent(
  competitionId: string,
  eventId: string
): void {
  invalidateMarshalSessionCacheForEvent(competitionId, eventId);
  invalidateResultCaptureSessionCacheForEvent(competitionId, eventId);
}

/** ラウンド単位で marshal / result capture キャッシュを削除 */
export function invalidateDayOpsStartListSessionCacheForRound(
  key: DayOpsStartListSessionCacheKey
): void {
  const k = cacheKey(key);
  marshalByKey.delete(k);
  resultCaptureByKey.delete(k);
}

/** テスト用: 全キャッシュをクリア */
export function clearDayOpsStartListSessionCacheForTests(): void {
  marshalByKey.clear();
  resultCaptureByKey.clear();
}
