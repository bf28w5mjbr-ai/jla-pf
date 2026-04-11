import { resolveHeatCount } from "@/lib/startListRounds";

/** スタートリスト上のラウンド（タブ）ごとのヒート／レーン */
export type StartListRoundTab = {
  id: string;
  label: string;
  mode: "count" | "size";
  heatCount: string;
  heatSize: string;
  /**
   * 先頭ラウンドのみ: 種目に最大レーン数（全ラウンド共通）があるとき、false なら保存したヒート／レーンで分割し、
   * 未指定・true なら ceil(人数÷最大レーン) の自動ヒート数（従来どおり）。
   */
  useAutoHeatFromMaxLanes?: boolean;
};

export type HeatSetting = {
  mode?: "count" | "size";
  heatCount?: string;
  heatSize?: string;
  /** ラウンド（タブ）ごとの分割。未指定時は従来の mode/heatCount/heatSize を1タブとして扱う */
  roundTabs?: StartListRoundTab[];
  /**
   * 先頭の次から順の「次ブロックのヒート数」の補助値（例: [4, 1]）。
   * 次ラ生成では {@link resolveHeatCountForSnapshotTransition} が roundTabs の mode/ヒート数/レーン数を優先し、
   * 足りないときだけこの配列を参照する（固定ラウンド名のテンプレではない）。
   */
  progressionHeatCounts?: number[];
};

type StartListSettingsEnvelope = {
  events?: Record<string, HeatSetting>;
  teamAssignmentDeadline?: string | null;
};

export function parseStartListSettings(value: unknown): {
  eventSettings: Record<string, HeatSetting>;
  teamAssignmentDeadline: string | null;
} {
  if (!value || typeof value !== "object") {
    return {
      eventSettings: {},
      teamAssignmentDeadline: null,
    };
  }

  const record = value as Record<string, unknown>;
  const hasEnvelopeShape = "events" in record || "teamAssignmentDeadline" in record;

  if (hasEnvelopeShape) {
    const envelope = record as StartListSettingsEnvelope;
    return {
      eventSettings:
        envelope.events && typeof envelope.events === "object"
          ? envelope.events
          : {},
      teamAssignmentDeadline:
        typeof envelope.teamAssignmentDeadline === "string"
          ? envelope.teamAssignmentDeadline
          : null,
    };
  }

  const reservedKeys = new Set(["globalSplit", "teamAssignmentDeadline", "events"]);
  const eventSettings: Record<string, HeatSetting> = {};
  for (const [key, val] of Object.entries(record)) {
    if (reservedKeys.has(key)) continue;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      eventSettings[key] = val as HeatSetting;
    }
  }

  return {
    eventSettings,
    teamAssignmentDeadline: null,
  };
}

export function buildStartListSettingsPayload(params: {
  eventSettings: Record<string, HeatSetting>;
  teamAssignmentDeadline?: string | null;
}) {
  return {
    events: params.eventSettings,
    teamAssignmentDeadline:
      typeof params.teamAssignmentDeadline === "string" &&
      params.teamAssignmentDeadline.trim().length > 0
        ? params.teamAssignmentDeadline
        : null,
  };
}

export const START_LIST_ROUND_LABEL_MAX_LEN = 40;

/**
 * ラウンド数（初回レースを含む全タブ）に応じた英語既定名。
 * 1: final / 2: semi, final / 3: quarter, semi, final / 4+: round1…, quarter, semi, final
 */
export function defaultProgressionRoundLabels(progressCount: number): string[] {
  if (progressCount <= 0) return [];
  if (progressCount === 1) return ["final"];
  if (progressCount === 2) return ["semi", "final"];
  if (progressCount === 3) return ["quarter", "semi", "final"];
  const labels: string[] = [];
  const prefixCount = progressCount - 3;
  for (let k = 1; k <= prefixCount; k += 1) {
    labels.push(`round${k}`);
  }
  labels.push("quarter", "semi", "final");
  return labels;
}

/**
 * スタートリストのタブ数（全ラウンド）に応じた既定名。先頭も含め {@link defaultProgressionRoundLabels} と同じ規則。
 */
export function defaultStartListRoundTabLabels(totalTabs: number): string[] {
  if (totalTabs <= 0) return [];
  return defaultProgressionRoundLabels(totalTabs);
}

/** 旧版の既定名（先頭のみ「予選」）— 保存済みデータのラベル付け直し判定用 */
function legacyDefaultStartListRoundTabLabels(totalTabs: number): string[] {
  if (totalTabs <= 0) return [];
  if (totalTabs === 1) return ["予選"];
  return ["予選", ...defaultProgressionRoundLabels(totalTabs - 1)];
}

function roundTabLabelsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** タブ数の規則に合わせてラベルだけ付け替える（id・分割設定は維持） */
export function applyDefaultRoundTabLabels(tabs: StartListRoundTab[]): StartListRoundTab[] {
  const names = defaultStartListRoundTabLabels(tabs.length);
  return tabs.map((t, i) => ({
    ...t,
    label: (names[i] ?? "round").slice(0, START_LIST_ROUND_LABEL_MAX_LEN),
  }));
}

/**
 * プレースホルダー・旧「予選＋本戦」形式と一致するときだけ、タブ数に応じた現行既定名に付け直す。
 */
export function reapplyDefaultRoundTabLabelsIfGeneric(tabs: StartListRoundTab[]): StartListRoundTab[] {
  const n = tabs.length;
  if (n === 0) return tabs;
  const labels = tabs.map((t) => (t.label?.trim() ?? ""));
  const currentDefaults = defaultStartListRoundTabLabels(n);
  if (roundTabLabelsEqual(labels, currentDefaults)) return tabs;

  const legacyDefaults = legacyDefaultStartListRoundTabLabels(n);
  const allPlaceholderLike = labels.every(
    (l) => l === "" || l === "ラウンド" || l === "予選"
  );
  const allSameLegacyPrelim =
    new Set(labels).size === 1 && labels[0] === "予選";
  if (
    allPlaceholderLike ||
    allSameLegacyPrelim ||
    roundTabLabelsEqual(labels, legacyDefaults)
  ) {
    return applyDefaultRoundTabLabels(tabs);
  }
  return tabs;
}

/** 表示・保存用にラウンドタブ配列を正規化（未設定なら従来設定から1タブ生成） */
export function normalizeRoundTabs(setting: HeatSetting): StartListRoundTab[] {
  if (Array.isArray(setting.roundTabs) && setting.roundTabs.length > 0) {
    const mapped: StartListRoundTab[] = setting.roundTabs.map((t, i) => {
      const mode = (t.mode === "size" ? "size" : "count") as "count" | "size";
      const heatSizeRaw = typeof t.heatSize === "string" ? t.heatSize.trim() : "";
      return {
        id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `round-${i}`,
        label: (t.label?.trim() || "ラウンド").slice(0, START_LIST_ROUND_LABEL_MAX_LEN),
        mode,
        heatCount: t.heatCount ?? "1",
        heatSize:
          mode === "size"
            ? heatSizeRaw !== ""
              ? heatSizeRaw
              : "8"
            : "",
        ...(t.useAutoHeatFromMaxLanes === false ? { useAutoHeatFromMaxLanes: false as const } : {}),
      };
    });
    return reapplyDefaultRoundTabLabelsIfGeneric(mapped);
  }
  const mode = setting.mode === "size" ? "size" : "count";
  const heatSizeRaw = setting.heatSize;
  const heatSizeNorm =
    mode === "size"
      ? typeof heatSizeRaw === "string" && heatSizeRaw.trim() !== ""
        ? heatSizeRaw.trim()
        : "8"
      : "";
  return reapplyDefaultRoundTabLabelsIfGeneric([
    {
      id: "default",
      label: defaultProgressionRoundLabels(1)[0] ?? "final",
      mode,
      heatCount: setting.heatCount ?? "1",
      heatSize: heatSizeNorm,
    },
  ]);
}

function newStartListRoundTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 種目のラウンド数に合わせ roundTabs を組み立て（既存タブの分割設定は可能な範囲で維持） */
export function buildRoundTabsForRoundCount(
  roundCount: number,
  previousTabs: StartListRoundTab[]
): StartListRoundTab[] {
  const n = Math.min(32, Math.max(1, Math.floor(roundCount)));
  const out: StartListRoundTab[] = [];
  for (let i = 0; i < n; i++) {
    const p = previousTabs[i];
    if (p) {
      const mode = p.mode === "size" ? "size" : "count";
      const hs = typeof p.heatSize === "string" ? p.heatSize.trim() : "";
      out.push({
        id: p.id,
        label: p.label,
        mode,
        heatCount: p.heatCount ?? "1",
        heatSize: mode === "size" ? (hs !== "" ? hs : "8") : "",
        ...(p.useAutoHeatFromMaxLanes === false ? { useAutoHeatFromMaxLanes: false as const } : {}),
      });
    } else {
      out.push({
        id: newStartListRoundTabId(),
        label: "",
        mode: "count",
        heatCount: "1",
        heatSize: "",
      });
    }
  }
  return applyDefaultRoundTabLabels(out);
}

/**
 * 先頭タブを「種目の全ラウンド共通の最大レーン数で自動ヒート数」とみなす形に揃える（JSON にはレーン数を保存しない）。
 * 実際の ceil(n/L) は {@link resolveHeatCount} ＋種目の preliminaryHeatLaneCount で都度計算する。
 */
export function applyAutoFirstRoundTabFromMaxLanes(
  tabs: StartListRoundTab[],
  maxLanesPerHeat: number | null | undefined
): StartListRoundTab[] {
  if (tabs.length === 0) return tabs;
  if (tabs[0]?.useAutoHeatFromMaxLanes === false) {
    return tabs;
  }
  if (
    typeof maxLanesPerHeat !== "number" ||
    !Number.isFinite(maxLanesPerHeat) ||
    maxLanesPerHeat < 1
  ) {
    return tabs;
  }
  const head = tabs[0]!;
  const {
    useAutoHeatFromMaxLanes: _drop,
    mode: _m,
    heatSize: _s,
    ...headRest
  } = head;
  void _drop;
  void _m;
  void _s;
  return [
    {
      ...headRest,
      mode: "count",
      heatCount: "1",
      heatSize: "",
    },
    ...tabs.slice(1),
  ];
}

export function roundTabToHeatSetting(tab: StartListRoundTab): HeatSetting {
  return {
    mode: tab.mode,
    heatCount: tab.heatCount,
    heatSize: tab.heatSize,
  };
}

/** スナップショット生成など、種目につき1系統のヒート数だけ参照する用（先頭タブ） */
export function primaryHeatSettingFromEventConfig(setting: HeatSetting | undefined): HeatSetting {
  const first = normalizeRoundTabs(setting ?? {})[0];
  return roundTabToHeatSetting(first);
}

/** 次ラウンド生成で progressionHeatCounts のどの要素を参照するか */
export function progressionHeatCountIndex(
  fromRound: "HEAT" | "SEMI",
  toRound: "SEMI" | "FINAL"
): number {
  if (fromRound === "SEMI" && toRound === "FINAL") return 1;
  return 0;
}

/**
 * スナップショットの次ブロック用ヒート数を、保存されている roundTabs（数値）を優先して都度解決する。
 * 優先順: リクエストの heatCount → 該当 roundTab を participantTotal で解決 → progressionHeatCounts → 既定。
 */
export function resolveHeatCountForSnapshotTransition(params: {
  setting: HeatSetting | undefined;
  participantTotal: number;
  fromRound: "HEAT" | "SEMI";
  toRound: "SEMI" | "FINAL";
  requestedHeatCount?: number;
}): number {
  const { setting, participantTotal, fromRound, toRound, requestedHeatCount } = params;
  if (typeof requestedHeatCount === "number" && requestedHeatCount >= 1) {
    return Math.min(64, requestedHeatCount);
  }
  const tabs = normalizeRoundTabs(setting ?? {});
  let tabIndex: number | null = null;
  if (fromRound === "HEAT" && toRound === "SEMI") {
    tabIndex = tabs.length >= 2 ? 1 : null;
  } else if (fromRound === "HEAT" && toRound === "FINAL" && tabs.length >= 2) {
    /** 2タブ（予選→決勝）など、中間 SEMI が無いときは最終タブのヒート数を使う */
    tabIndex = tabs.length - 1;
  } else if (fromRound === "SEMI" && toRound === "FINAL") {
    tabIndex = tabs.length >= 2 ? tabs.length - 1 : null;
  }
  if (tabIndex != null && tabs[tabIndex]) {
    const hc = resolveHeatCount(participantTotal, roundTabToHeatSetting(tabs[tabIndex]!));
    if (hc >= 1) return Math.min(64, hc);
  }
  const progIdx = progressionHeatCountIndex(fromRound, toRound);
  const prog = setting?.progressionHeatCounts;
  if (typeof prog?.[progIdx] === "number" && prog[progIdx]! >= 1) {
    return Math.min(64, prog[progIdx]!);
  }
  return toRound === "FINAL" ? 1 : 2;
}

/**
 * スタートリスト設定の teamAssignmentDeadline（JSON）。
 * チームメンバー割当の**通知・表示用の目安**に使う。編集可否の上限には使わない。
 * 未設定時は fallbackDate（通常は大会開始日）を返す。
 */
export function resolveTeamAssignmentDeadline(
  startListSettings: unknown,
  fallbackDate?: Date | string | null
) {
  const { teamAssignmentDeadline } = parseStartListSettings(startListSettings);
  if (teamAssignmentDeadline) {
    return new Date(teamAssignmentDeadline);
  }

  if (fallbackDate) {
    return new Date(fallbackDate);
  }

  return null;
}
