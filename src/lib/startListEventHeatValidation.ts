import type { HeatSetting, StartListRoundTab } from "@/lib/startListSettings";
import {
  normalizeRoundTabs,
  START_LIST_ROUND_LABEL_MAX_LEN,
} from "@/lib/startListSettings";
import { computeHeatCountFromMaxLanes, resolveHeatCount } from "@/lib/startListRounds";

/**
 * ラウンドタブ順の「実効ヒート数」（先頭の最大レーン自動・size モードは entryCount から解決）。
 * スタートリスト UI / API の単調性チェックで共通利用。
 */
export function effectiveHeatCountsForRoundTabs(
  tabs: StartListRoundTab[],
  entryCount: number,
  maxLanesPerHeat: number | null | undefined
): number[] {
  const L =
    typeof maxLanesPerHeat === "number" &&
    Number.isFinite(maxLanesPerHeat) &&
    maxLanesPerHeat >= 1
      ? Math.min(64, Math.max(1, Math.floor(maxLanesPerHeat)))
      : null;

  return tabs.map((t, index) => {
    if (index === 0 && t.useAutoHeatFromMaxLanes !== false && L !== null) {
      if (entryCount <= 0) return 0;
      return computeHeatCountFromMaxLanes(entryCount, L) ?? 1;
    }
    if (t.mode === "size") {
      if (entryCount > 0) {
        return resolveHeatCount(entryCount, { mode: "size", heatSize: t.heatSize });
      }
      const n = parseInt(String(t.heatCount || "1"), 10);
      return Number.isFinite(n) && n >= 1 ? n : 1;
    }
    const n = parseInt(String(t.heatCount || "1"), 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });
}

function roundTabsHeatMonotonicErrorMessage(
  tabs: StartListRoundTab[],
  entryCount: number,
  maxLanesPerHeat: number | null | undefined
): string | null {
  if (tabs.length <= 1) return null;
  const eff = effectiveHeatCountsForRoundTabs(tabs, entryCount, maxLanesPerHeat);
  for (let i = 0; i < eff.length - 1; i += 1) {
    const prev = eff[i]!;
    const next = eff[i + 1]!;
    if (prev >= 1 && next > prev) {
      return `ラウンド別ヒート数が不正です。ラウンド${i + 2}はラウンド${i + 1}以下（最大${prev}ヒート）にしてください。`;
    }
  }
  return null;
}

/**
 * 後続ラウンドのヒート数が前ラウンドを超えないよう、heatCount を繰り下げて揃える（UI 用）。
 */
export function clampRoundTabsToNonIncreasingHeatCounts(
  tabs: StartListRoundTab[],
  entryCount: number,
  maxLanesPerHeat: number | null | undefined
): StartListRoundTab[] {
  if (tabs.length <= 1) return tabs;
  const cur = tabs.map((t) => ({ ...t }));
  for (let guard = 0; guard < 64; guard += 1) {
    const eff = effectiveHeatCountsForRoundTabs(cur, entryCount, maxLanesPerHeat);
    let fixed = false;
    for (let i = 1; i < eff.length; i += 1) {
      if (eff[i - 1]! >= 1 && eff[i]! > eff[i - 1]!) {
        cur[i] = {
          ...cur[i]!,
          mode: "count",
          heatSize: "",
          heatCount: String(eff[i - 1]!),
        };
        fixed = true;
        break;
      }
    }
    if (!fixed) return cur;
  }
  return cur;
}

export function validateEventSettingsRoundTabHeatMonotonic(
  eventSettings: Record<string, HeatSetting>,
  eventMeta: Record<
    string,
    { entryCount: number; preliminaryHeatLaneCount: number | null }
  >
): { ok: true } | { ok: false; message: string } {
  for (const [eventId, meta] of Object.entries(eventMeta)) {
    const setting =
      eventSettings[eventId] ?? ({ mode: "count" as const, heatCount: "1", heatSize: "" } satisfies HeatSetting);
    const tabs = normalizeRoundTabs(setting);
    const err = roundTabsHeatMonotonicErrorMessage(
      tabs,
      meta.entryCount,
      meta.preliminaryHeatLaneCount
    );
    if (err) return { ok: false, message: err };
  }
  return { ok: true };
}

function parseRoundTabOne(item: unknown): StartListRoundTab | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const t = item as Record<string, unknown>;
  const id = typeof t.id === "string" && t.id.trim() ? t.id.trim() : null;
  const labelRaw = typeof t.label === "string" ? t.label.trim() : "";
  const label = (labelRaw || "ラウンド").slice(0, START_LIST_ROUND_LABEL_MAX_LEN);
  if (!id) return null;
  const mode = t.mode === "size" ? "size" : "count";
  const heatCount = typeof t.heatCount === "string" ? t.heatCount : "1";
  const heatSize = typeof t.heatSize === "string" ? t.heatSize : "8";
  if (mode === "count") {
    const n = parseInt(heatCount, 10);
    if (!Number.isFinite(n) || n < 1) return null;
  } else {
    const n = parseInt(heatSize, 10);
    if (!Number.isFinite(n) || n < 1) return null;
  }
  const useAutoHeatFromMaxLanes =
    t.useAutoHeatFromMaxLanes === false ? (false as const) : undefined;
  return {
    id,
    label,
    mode,
    heatCount,
    heatSize,
    ...(useAutoHeatFromMaxLanes === false ? { useAutoHeatFromMaxLanes: false } : {}),
  };
}

function parseProgressionHeatCounts(o: Record<string, unknown>): number[] | undefined {
  if (!Array.isArray(o.progressionHeatCounts)) return undefined;
  const arr = o.progressionHeatCounts
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    .map((x) => Math.floor(x))
    .filter((x) => x >= 1 && x <= 64);
  if (arr.length < 1 || arr.length > 31) return undefined;
  return arr;
}

function parseOneHeatSetting(val: unknown): HeatSetting | null {
  if (!val || typeof val !== "object" || Array.isArray(val)) return null;
  const o = val as Record<string, unknown>;
  const progressionHeatCounts = parseProgressionHeatCounts(o);

  if (Array.isArray(o.roundTabs) && o.roundTabs.length > 0) {
    const tabs: StartListRoundTab[] = [];
    for (const item of o.roundTabs) {
      const tab = parseRoundTabOne(item);
      if (!tab) return null;
      tabs.push(tab);
    }
    const first = tabs[0];
    return {
      roundTabs: tabs,
      mode: first.mode,
      heatCount: first.heatCount,
      heatSize: first.heatSize,
      ...(progressionHeatCounts ? { progressionHeatCounts } : {}),
    };
  }

  const mode = o.mode === "size" ? "size" : "count";
  const heatCount = typeof o.heatCount === "string" ? o.heatCount : "1";
  const heatSize = typeof o.heatSize === "string" ? o.heatSize : "1";
  if (mode === "count") {
    const n = parseInt(heatCount, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return {
      mode: "count",
      heatCount,
      heatSize,
      ...(progressionHeatCounts ? { progressionHeatCounts } : {}),
    };
  }
  const n = parseInt(heatSize, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return {
    mode: "size",
    heatCount,
    heatSize,
    ...(progressionHeatCounts ? { progressionHeatCounts } : {}),
  };
}

/** オフィシャル更新用：大会の全種目ぶんの HeatSetting のみ受け付け */
export function validateOfficialEventHeatMap(
  raw: unknown,
  eventIds: Set<string>
): Record<string, HeatSetting> | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "events の形式が正しくありません" };
  }
  const record = raw as Record<string, unknown>;
  for (const id of eventIds) {
    if (!Object.prototype.hasOwnProperty.call(record, id)) {
      return { error: "全種目のヒート／レーン設定が必要です" };
    }
  }
  const out: Record<string, HeatSetting> = {};
  for (const id of eventIds) {
    const one = parseOneHeatSetting(record[id]);
    if (!one) {
      return { error: "種目のヒート／レーン設定が不正です" };
    }
    out[id] = one;
  }
  for (const key of Object.keys(record)) {
    if (!eventIds.has(key)) {
      return { error: "不正な種目 ID が含まれています" };
    }
  }
  return out;
}
