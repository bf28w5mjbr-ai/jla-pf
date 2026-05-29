import type { ResultRound } from "@prisma/client";
import {
  buildRoundTabsForRoundCount,
  normalizeRoundTabs,
  parseStartListSettings,
  pickHeatSettingForEvent,
  resolveHeatCountForSnapshotTransition,
  resolveRoundTabsForEvent,
  resolveTabMaxLanes,
  roundTabToHeatSetting,
  type HeatSetting,
  type StartListRoundTab,
} from "@/lib/startListSettings";
import { normalizeSnapshotRoundKey } from "@/lib/heatMarshalFromSnapshot";
import {
  computeAdvanceCountsByLaneSlotsPerHeat,
  enforceMinHeatCountForMaxLanes,
  reorderRounds,
  resolveHeatCount,
  type StartListRound,
  type StartListRoundData,
  type StartListParticipant,
} from "@/lib/startListRounds";
import {
  buildDispersedIndividualParticipantHeats,
  buildDispersedTeamParticipantHeats,
  createStartListRng,
  individualHeatsToDisplayRows,
  teamHeatsToDisplayRows,
  type StartListIndividualDisplayItem,
  type StartListTeamDisplayItem,
} from "@/lib/startListHeatPlacement";

export type { StartListIndividualDisplayItem, StartListTeamDisplayItem };

/** ラウンドタブ表示名に、現在のエントリー分割に基づくヒート数を付与する */
export function formatStartListTabLabelWithHeatCount(label: string, heatCount: number): string {
  const base = label.trim() || "ラウンド";
  return `${base}（${heatCount}ヒート）`;
}

export function buildHeatsForStartList<T>(items: T[], count: number): T[][] {
  if (count <= 0) return [] as T[][];
  const base = Math.floor(items.length / count);
  const remainder = items.length % count;
  const result: T[][] = [];
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    result.push(items.slice(offset, offset + size));
    offset += size;
  }
  return result;
}

export function getLiveTabsAligned(
  setting: HeatSetting,
  startListRoundCount: number | null | undefined
): StartListRoundTab[] {
  return resolveRoundTabsForEvent({
    heatSetting: setting,
    roundCount: startListRoundCount,
  });
}

export type StartListIndividualInput = {
  entryId: string;
  userId: string;
  name: string;
  clubId: string | null;
  clubName: string | null;
};

export type StartListTeamInput = {
  teamEntryId: string;
  teamName: string;
  clubId: string | null;
  clubName: string | null;
  members: string[];
};

/**
 * ステップ1確定後: 先頭ラウンド各ヒートから次ラウンドへの按分アップ人数。
 * 次ラ生成 API の按分と同じ（総枠は次ヒート数×最大レーン、`computeAdvanceCountsEqualAcrossHeats` 内で min(その枠, totalParticipants)）。
 * `totalParticipants` と `heatSizes` の合計は、サーバの次ラ生成で使う母集団（例: 召集 CALLED かつ公式行が残る人数）に揃えると表示と一致する。
 * ラウンドが1つだけ・最大レーン未設定・人数0のときは各ヒート null。
 */
export function computeLiveFirstRoundAdvanceQuotas(params: {
  heatSizes: number[];
  totalParticipants: number;
  liveTabs: StartListRoundTab[];
  preliminaryHeatLaneCount: number | null | undefined;
  /** progressionHeatCounts など（roundTabs は liveTabs を優先） */
  eventHeatSetting?: HeatSetting | undefined;
}): (number | null)[] {
  const n = params.heatSizes.length;
  if (n === 0) return [];
  const out = computeLiveAdvanceQuotasForFrozenNonFinalTab({
    snapshotRound: "HEAT",
    tabIndex: 0,
    tabCount: params.liveTabs.length,
    heatSizes: params.heatSizes,
    totalParticipants: params.totalParticipants,
    liveTabs: params.liveTabs,
    preliminaryHeatLaneCount: params.preliminaryHeatLaneCount,
    eventHeatSetting: params.eventHeatSetting,
  });
  return out ?? params.heatSizes.map(() => null);
}

/**
 * 凍結表示中の **最終ラウンド以外**のタブについて、次タブへの按分アップ枠を算出する（API の次ラ生成と同じ式）。
 * FINAL には次がないため null。
 */
export function computeLiveAdvanceQuotasForFrozenNonFinalTab(params: {
  snapshotRound: StartListRound;
  tabIndex: number;
  tabCount: number;
  heatSizes: number[];
  totalParticipants: number;
  liveTabs: StartListRoundTab[];
  preliminaryHeatLaneCount: number | null | undefined;
  eventHeatSetting?: HeatSetting | undefined;
}): (number | null)[] | null {
  const {
    snapshotRound,
    tabIndex,
    tabCount,
    heatSizes,
    totalParticipants,
    liveTabs,
    preliminaryHeatLaneCount,
    eventHeatSetting,
  } = params;
  const n = heatSizes.length;
  if (n === 0) return null;
  if (tabCount < 2 || totalParticipants <= 0) return null;
  const expectedKey = snapshotRoundForTab(tabIndex, tabCount);
  if (!expectedKey || expectedKey !== snapshotRound) return null;
  if (snapshotRound === "FINAL") return null;
  if (tabIndex >= tabCount - 1) return null;
  const destTab = liveTabs[tabIndex + 1];
  if (!destTab) return null;
  const Lresolved = resolveTabMaxLanes(destTab, preliminaryHeatLaneCount);
  if (typeof Lresolved !== "number" || !Number.isFinite(Lresolved) || Lresolved < 1) {
    return null;
  }
  const toKey = snapshotRoundForTab(tabIndex + 1, tabCount);
  if (!toKey) return null;

  const head = liveTabs[0];
  if (!head) return null;
  const setting: HeatSetting = {
    progressionHeatCounts: eventHeatSetting?.progressionHeatCounts,
    roundTabs: liveTabs,
    mode: head.mode,
    heatCount: head.heatCount,
    heatSize: head.heatSize,
  };
  const fromApi = snapshotRound === "HEAT" ? "HEAT" : "SEMI";
  const toApi = toKey === "FINAL" ? "FINAL" : "SEMI";
  const nextHeatCount = resolveHeatCountForSnapshotTransition({
    setting,
    participantTotal: totalParticipants,
    fromRound: fromApi,
    toRound: toApi,
  });
  const L = Math.max(1, Math.floor(Lresolved));
  const capacity = nextHeatCount * L;
  return computeAdvanceCountsByLaneSlotsPerHeat(n, Lresolved, capacity);
}

/**
 * UI タブ index とラウンド数から、スナップショット JSON 上の `round`（ResultRound）を対応付ける。
 *
 * DB / スナップショットは **HEAT・SEMI・FINAL の3値だけ**を持つため、タブが4本以上でも
 * 2本目以降の一部はすべて `FINAL` に潰れる（最後のタブのラベルが採用されやすい）。
 * よってこれらは **競技用語の「予選／準決勝／決勝」とは一致しない**場合がある。
 */
export function snapshotRoundForTab(tabIndex: number, tabCount: number): StartListRound | null {
  if (tabCount < 1) return null;
  if (tabCount === 1) return "HEAT";
  if (tabCount === 2) return tabIndex === 0 ? "HEAT" : "FINAL";
  if (tabIndex === 0) return "HEAT";
  if (tabIndex === 1) return "SEMI";
  return "FINAL";
}

/**
 * 後続タブのプレビュー用に、そのラウンドに載りうる人数の上限を推定する。
 * 各ステップで min(次タブのヒート数×L, 直前の人数) を連鎖（按分定員と整合）。
 */
function estimateMaxParticipantsForStartListTabPreview(params: {
  tabIndex: number;
  tabCount: number;
  total: number;
  liveTabs: StartListRoundTab[];
  eventDefaultLanes: number | null | undefined;
  eventHeatSetting?: HeatSetting | undefined;
}): number {
  const { tabIndex, tabCount, total, liveTabs, eventDefaultLanes, eventHeatSetting } = params;
  if (tabIndex <= 0) return total;
  const head = liveTabs[0];
  if (!head) return total;
  const setting: HeatSetting = {
    progressionHeatCounts: eventHeatSetting?.progressionHeatCounts,
    roundTabs: liveTabs,
    mode: head.mode,
    heatCount: head.heatCount,
    heatSize: head.heatSize,
  };
  let n = total;
  for (let s = 0; s < tabIndex; s += 1) {
    const fromKey = snapshotRoundForTab(s, tabCount);
    const toKey = snapshotRoundForTab(s + 1, tabCount);
    const destTab = liveTabs[s + 1];
    if (!destTab) break;

    let H: number;
    if (fromKey && toKey && !(fromKey === "FINAL" && toKey === "FINAL")) {
      const fromApi = fromKey === "HEAT" ? "HEAT" : "SEMI";
      const toApi = toKey === "FINAL" ? "FINAL" : "SEMI";
      H = resolveHeatCountForSnapshotTransition({
        setting,
        participantTotal: n,
        fromRound: fromApi,
        toRound: toApi,
      });
    } else {
      H = resolveHeatCount(n, roundTabToHeatSetting(destTab));
    }
    H = Math.max(1, Math.min(64, H));
    const Ldest = resolveTabMaxLanes(destTab, eventDefaultLanes);
    if (typeof Ldest === "number" && Ldest >= 1) {
      const L = Math.max(1, Math.floor(Ldest));
      n = Math.min(H * L, n);
    }
  }
  return Math.max(0, n);
}

/**
 * 上記キーごとに、種目スタートリストのタブ表示名を紐付ける（当日運用のラウンド選択用）。
 * 同一キーに複数タブが該当する場合は **後勝ち**（最終タブのラベル）。
 */
export function buildMarshalRoundLabelBySnapshotKey(
  roundTabs: StartListRoundTab[],
  tabCount: number
): Partial<Record<StartListRound, string>> {
  const out: Partial<Record<StartListRound, string>> = {};
  const n = Math.max(0, Math.floor(tabCount));
  for (let i = 0; i < n; i += 1) {
    const key = snapshotRoundForTab(i, n);
    if (!key) continue;
    const tab = roundTabs[i];
    const primary = tab?.label?.trim();
    out[key] = primary && primary.length > 0 ? primary : key;
  }
  return out;
}

/** スナップショットにヒートが入っている＝そのラウンドは確定済み（公開可） */
export function isStartListTabFrozen(
  tabIndex: number,
  tabCount: number,
  frozenSnapshotRounds: StartListRoundData[] | null | undefined
): boolean {
  const key = snapshotRoundForTab(tabIndex, tabCount);
  if (!key) return false;
  const block = frozenSnapshotRounds?.find((r) => normalizeSnapshotRoundKey(r.round) === key);
  return Boolean(block?.heats?.length);
}

/**
 * 一般公開のスタートリスト用。
 * `startListRoundCount` が大きいと複数タブが同じスナップショット round（例: FINAL）に写り、
 * いずれも「凍結済み」と判定されてタブが雪だる式に増えるため、round キーごとに先頭タブだけ残す。
 */
export function dedupeFrozenTabIndicesBySnapshotRound(
  tabCount: number,
  frozenSnapshotRounds: StartListRoundData[] | null | undefined
): number[] {
  const n = Math.max(0, Math.floor(tabCount));
  const seenRound = new Set<StartListRound>();
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!isStartListTabFrozen(i, n, frozenSnapshotRounds)) continue;
    const key = snapshotRoundForTab(i, n);
    if (!key) continue;
    if (seenRound.has(key)) continue;
    seenRound.add(key);
    out.push(i);
  }
  return out;
}

function advanceQuotaForSnapshotHeat(
  heatIndex: number,
  quotas: { heat: number; quota: number }[] | undefined
): number | null {
  if (!quotas?.length) return null;
  const exact = quotas.find((q) => q.heat === heatIndex);
  if (exact) return exact.quota;
  return null;
}

/** 凍結ヒート行のチームメンバー名を、スナップショットではなく DB 由来の liveTeams で上書きする */
function resolveTeamMembersForFrozenRow(
  teamEntryId: string,
  snapshotMembers: string[] | undefined,
  liveByTeamId: Map<string, string[]>
): string[] {
  if (liveByTeamId.has(teamEntryId)) {
    return liveByTeamId.get(teamEntryId) ?? [];
  }
  return Array.isArray(snapshotMembers) ? snapshotMembers : [];
}

function heatsFromFrozenSnapshotRound(
  round: StartListRoundData,
  isTeam: boolean,
  options?: {
    liveTabs: StartListRoundTab[];
    preliminaryHeatLaneCount: number | null | undefined;
    heatPlanStep1Confirmed: boolean;
    eventHeatSetting?: HeatSetting | undefined;
    tabIndex: number;
    tabCount: number;
    /** チームメンバー割当後も表示を更新するため、DB の最新メンバー一覧 */
    liveTeams?: StartListTeamInput[];
  }
): {
  individualHeats: StartListIndividualDisplayItem[][];
  teamHeats: StartListTeamDisplayItem[][];
  heatAdvanceQuotas: (number | null)[];
  marshalDisplayHeatIndices: number[];
} {
  const heatsSorted = [...round.heats].sort((a, b) => a.heatIndex - b.heatIndex);
  const quotas = round.advanceQuotasByOfficialHeat;
  let computed: (number | null)[] | null = null;
  if (
    options?.heatPlanStep1Confirmed &&
    options.liveTabs.length >= 2 &&
    typeof options.tabIndex === "number" &&
    typeof options.tabCount === "number"
  ) {
    const heatSizes = heatsSorted.map((h) => h.participants.length);
    const totalParticipants = heatSizes.reduce((a, b) => a + b, 0);
    const snapshotRound =
      (normalizeSnapshotRoundKey(round.round) ?? round.round) as StartListRound;
    computed = computeLiveAdvanceQuotasForFrozenNonFinalTab({
      snapshotRound,
      tabIndex: options.tabIndex,
      tabCount: options.tabCount,
      heatSizes,
      totalParticipants,
      liveTabs: options.liveTabs,
      preliminaryHeatLaneCount: options.preliminaryHeatLaneCount,
      eventHeatSetting: options.eventHeatSetting,
    });
  }
  // 保存済み advanceQuotasByOfficialHeat は次ラ生成時点の値のため古くなりうる。表示は常に現行ルールで再計算した値を優先する。
  const heatAdvanceQuotas = heatsSorted.map((h, i) => {
    const c = computed?.[i];
    if (typeof c === "number") return c;
    const stored = advanceQuotaForSnapshotHeat(h.heatIndex, quotas);
    if (stored != null) return stored;
    return null;
  });
  const marshalDisplayHeatIndices = heatsSorted.map((h) => h.heatIndex);

  if (isTeam) {
    const liveByTeamId = new Map<string, string[]>();
    for (const t of options?.liveTeams ?? []) {
      liveByTeamId.set(t.teamEntryId, t.members);
    }
    const teamHeats = heatsSorted.map((h) =>
      h.participants
        .filter((p): p is Extract<StartListParticipant, { kind: "TEAM" }> => p.kind === "TEAM")
        .map((p) => ({
          teamEntryId: p.teamEntryId,
          teamName: p.teamName,
          clubName: p.clubName,
          members: resolveTeamMembersForFrozenRow(p.teamEntryId, p.members, liveByTeamId),
        }))
    );
    return {
      individualHeats: [],
      teamHeats,
      heatAdvanceQuotas,
      marshalDisplayHeatIndices,
    };
  }
  const individualHeats = heatsSorted.map((h) =>
    h.participants
      .filter((p): p is Extract<StartListParticipant, { kind: "INDIVIDUAL" }> => p.kind === "INDIVIDUAL")
      .map((p) => ({
        entryId: p.entryId,
        name: p.name,
        clubId: p.clubId,
        clubName: p.clubName,
      }))
  );
  return {
    individualHeats,
    teamHeats: [],
    heatAdvanceQuotas,
    marshalDisplayHeatIndices,
  };
}

/** DB の startListSnapshot.data から、種目の確定ラウンド一覧を取り出す */
export function extractFrozenRoundsForEventFromSnapshotData(
  data: unknown,
  eventId: string
): StartListRoundData[] | null {
  if (!data || typeof data !== "object") return null;
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  const ev = events.find(
    (e: unknown) => e && typeof e === "object" && (e as { eventId?: string }).eventId === eventId
  ) as { rounds?: unknown } | undefined;
  if (!ev || !Array.isArray(ev.rounds)) return null;
  const raw = ev.rounds as StartListRoundData[];
  const normalized = raw.map((r) => {
    const key = normalizeSnapshotRoundKey(r.round);
    return {
      ...r,
      round: (key ?? r.round) as StartListRound,
      heats: [...r.heats].sort((a, b) => a.heatIndex - b.heatIndex),
    };
  });
  return reorderRounds(normalized);
}

export type StartListTabDisplaySource =
  | "liveEntry"
  | "snapshotHeat"
  | "snapshotResult"
  | "previewStructure";

export function resolveTabDisplaySource(
  tabIndex: number,
  frozenBlock: StartListRoundData | null | undefined
): StartListTabDisplaySource {
  if (frozenBlock?.heats?.length) {
    return frozenBlock.generatedBy === "RESULT_BASED" ? "snapshotResult" : "snapshotHeat";
  }
  if (tabIndex === 0) return "liveEntry";
  return "previewStructure";
}

export function startListTabDisplaySourceLabel(source: StartListTabDisplaySource): string {
  switch (source) {
    case "liveEntry":
      return "最新";
    case "snapshotHeat":
      return "記録";
    case "snapshotResult":
      return "結果確定";
    case "previewStructure":
      return "試算";
    default:
      return source;
  }
}

export function getLiveHeatsByTab(params: {
  liveTabs: StartListRoundTab[];
  individuals: StartListIndividualInput[];
  teams: StartListTeamInput[];
  isTeam: boolean;
  preliminaryHeatLaneCount: number | null | undefined;
  /** 公式結果の着（エントリーID / チームエントリーID → rank） */
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  /** 並び再計算用シード（サーバーがエントリー構成などから決定） */
  placementSeed: number;
  /** ある場合は該当ラウンドのタブはスナップショットの並びをそのまま表示（自動確定分） */
  frozenSnapshotRounds?: StartListRoundData[] | null;
  /** ステップ1確定後、先頭ラウンドのヒートごとに「按分アップ」人数を表示する */
  heatPlanStep1Confirmed?: boolean;
  /** progressionHeatCounts 等（按分アップ計算用） */
  eventHeatSetting?: HeatSetting | undefined;
}): Array<{
  tab: StartListRoundTab;
  individualHeats: StartListIndividualDisplayItem[][];
  teamHeats: StartListTeamDisplayItem[][];
  /** 各ヒートの次ラウンド進出枠（確定データがあるときのみ） */
  heatAdvanceQuotas: (number | null)[];
  /** マーシャル・リザルトAPIの heatIndex（行インデックス＋1 と一致しない場合あり） */
  marshalDisplayHeatIndices: number[];
  previewEstimatedParticipants?: number;
  previewMaxLanesPerHeat?: number;
}> {
  const {
    liveTabs,
    individuals,
    teams,
    isTeam,
    preliminaryHeatLaneCount,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    heatPlanStep1Confirmed = false,
    eventHeatSetting,
  } = params;
  const total = isTeam ? teams.length : individuals.length;
  const tabCount = liveTabs.length;

  return liveTabs.map((tab, tabIndex) => {
    const snapKey = snapshotRoundForTab(tabIndex, tabCount);
    const frozenBlock =
      snapKey && frozenSnapshotRounds?.length
        ? frozenSnapshotRounds.find((r) => normalizeSnapshotRoundKey(r.round) === snapKey)
        : null;
    if (frozenBlock?.heats?.length) {
      return {
        tab,
        ...heatsFromFrozenSnapshotRound(frozenBlock, isTeam, {
          liveTabs,
          preliminaryHeatLaneCount,
          heatPlanStep1Confirmed,
          eventHeatSetting,
          tabIndex,
          tabCount,
          liveTeams: teams,
        }),
      };
    }

    const LThisTab = resolveTabMaxLanes(tab, preliminaryHeatLaneCount);
    const lanesOk =
      typeof LThisTab === "number" && Number.isFinite(LThisTab) && LThisTab >= 1;

    const heatSetting = roundTabToHeatSetting(tab);

    /** 後続タブは進行定員で人数を絞り、最大レーン L をヒート分割に反映（未設定時は従来どおり全員） */
    const nForRound =
      tabIndex > 0
        ? estimateMaxParticipantsForStartListTabPreview({
            tabIndex,
            tabCount,
            total,
            liveTabs,
            eventDefaultLanes: preliminaryHeatLaneCount,
            eventHeatSetting,
          })
        : total;

    const resolvedCount = resolveHeatCount(nForRound, heatSetting);
    const heatCount =
      tabIndex === 0
        ? enforceMinHeatCountForMaxLanes(total, resolvedCount, LThisTab)
        : lanesOk
          ? enforceMinHeatCountForMaxLanes(nForRound, resolvedCount, LThisTab)
          : resolvedCount;

    /** 後続タブの試算: 枠組みのみ（選手名は載せない） */
    if (tabIndex > 0) {
      if (total === 0 || heatCount <= 0) {
        return {
          tab,
          individualHeats: [],
          teamHeats: [],
          heatAdvanceQuotas: [],
          marshalDisplayHeatIndices: [],
          previewEstimatedParticipants: nForRound,
          previewMaxLanesPerHeat:
            typeof LThisTab === "number" && Number.isFinite(LThisTab) ? LThisTab : undefined,
        };
      }
      const marshalDisplayHeatIndices = Array.from({ length: heatCount }, (_, i) => i + 1);
      const emptyIndividualHeats: StartListIndividualDisplayItem[][] = Array.from(
        { length: heatCount },
        () => []
      );
      const emptyTeamHeats: StartListTeamDisplayItem[][] = Array.from({ length: heatCount }, () => []);
      return {
        tab,
        individualHeats: isTeam ? [] : emptyIndividualHeats,
        teamHeats: isTeam ? emptyTeamHeats : [],
        heatAdvanceQuotas: [],
        marshalDisplayHeatIndices,
        previewEstimatedParticipants: nForRound,
        previewMaxLanesPerHeat:
          typeof LThisTab === "number" && Number.isFinite(LThisTab) ? LThisTab : undefined,
      };
    }

    const activeIndividuals = individuals;
    const activeTeams = teams;
    const activeTotal = isTeam ? activeTeams.length : activeIndividuals.length;

    const tabSeed = (placementSeed ^ (tabIndex + 1) * 0x9e37_79b9) >>> 0;
    const rng = createStartListRng(tabSeed);

    if (total === 0 || heatCount <= 0 || activeTotal === 0) {
      return {
        tab,
        individualHeats: [],
        teamHeats: [],
        heatAdvanceQuotas: [],
        marshalDisplayHeatIndices: [],
      };
    }

    if (!isTeam) {
      const heats = buildDispersedIndividualParticipantHeats({
        individuals: activeIndividuals.map((it) => ({
          ...it,
          rank: null,
        })),
        heatCount,
        tabIndex,
        officialRanksByRound: officialRanksByRound ?? null,
        rng,
      });
      const individualHeats = individualHeatsToDisplayRows(heats);
      let heatAdvanceQuotas: (number | null)[] = individualHeats.map(() => null);
      if (heatPlanStep1Confirmed && tabIndex === 0 && tabCount >= 2) {
        heatAdvanceQuotas = computeLiveFirstRoundAdvanceQuotas({
          heatSizes: individualHeats.map((h) => h.length),
          totalParticipants: total,
          liveTabs,
          preliminaryHeatLaneCount,
          eventHeatSetting,
        });
      }
      return {
        tab,
        individualHeats,
        teamHeats: [],
        heatAdvanceQuotas,
        marshalDisplayHeatIndices: individualHeats.map((_, i) => i + 1),
      };
    }

    const heats = buildDispersedTeamParticipantHeats({
      teams: activeTeams.map((t) => ({
        ...t,
        rank: null,
      })),
      heatCount,
      tabIndex,
      officialRanksByRound: officialRanksByRound ?? null,
      rng,
    });
    const teamHeats = teamHeatsToDisplayRows(heats);
    let heatAdvanceQuotas: (number | null)[] = teamHeats.map(() => null);
    if (heatPlanStep1Confirmed && tabIndex === 0 && tabCount >= 2) {
      heatAdvanceQuotas = computeLiveFirstRoundAdvanceQuotas({
        heatSizes: teamHeats.map((h) => h.length),
        totalParticipants: total,
        liveTabs,
        preliminaryHeatLaneCount,
        eventHeatSetting,
      });
    }
    return {
      tab,
      individualHeats: [],
      teamHeats,
      heatAdvanceQuotas,
      marshalDisplayHeatIndices: teamHeats.map((_, i) => i + 1),
    };
  });
}

export type StartListEventRoundDisplayRow = {
  tab: StartListRoundTab;
  individualHeats: StartListIndividualDisplayItem[][];
  teamHeats: StartListTeamDisplayItem[][];
  heatAdvanceQuotas: (number | null)[];
  marshalDisplayHeatIndices: number[];
  displaySource: StartListTabDisplaySource;
  snapshotRoundKey: StartListRound | null;
  previewEstimatedParticipants?: number;
  previewMaxLanesPerHeat?: number;
};

export type StartListEventRoundDisplay = {
  eventHeatSetting: HeatSetting;
  allTabs: StartListRoundTab[];
  /** mode=public では確定ラウンドのみ。ops では allTabs と同じインデックス */
  visibleTabIndices: number[];
  rows: StartListEventRoundDisplayRow[];
};

/**
 * 種目スタートリストページ向け: ラウンドタブとヒート表を一括計算する。
 * public はスナップショットで凍結したラウンドのタブのみ visibleTabIndices に含める。
 */
export function buildStartListEventRoundDisplay(params: {
  eventId: string;
  initialSettings: unknown;
  startListRoundCount: number | null | undefined;
  configuredStartListRoundCount?: number | null;
  entryCount?: number;
  individuals: StartListIndividualInput[];
  teams: StartListTeamInput[];
  isTeam: boolean;
  preliminaryHeatLaneCount: number | null | undefined;
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  placementSeed: number;
  frozenSnapshotRounds?: StartListRoundData[] | null;
  heatPlanConfirmedAtIso?: string | null;
  mode: "public" | "ops";
}): StartListEventRoundDisplay {
  const {
    eventId,
    initialSettings,
    startListRoundCount,
    configuredStartListRoundCount,
    entryCount,
    individuals,
    teams,
    isTeam,
    preliminaryHeatLaneCount,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    heatPlanConfirmedAtIso,
    mode,
  } = params;

  const parsed = parseStartListSettings(initialSettings);
  const eventHeatSetting = pickHeatSettingForEvent(parsed.eventSettings, eventId);
  const heatPlanStep1Confirmed = Boolean(heatPlanConfirmedAtIso);

  const allTabs =
    mode === "ops"
      ? resolveRoundTabsForEvent({
          heatSetting: eventHeatSetting,
          roundCount: configuredStartListRoundCount ?? startListRoundCount,
          entryCount,
          coerceToCount: true,
        })
      : getLiveTabsAligned(eventHeatSetting, startListRoundCount);

  const heatsByTab = getLiveHeatsByTab({
    liveTabs: allTabs,
    individuals,
    teams,
    isTeam,
    preliminaryHeatLaneCount,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    heatPlanStep1Confirmed,
    eventHeatSetting,
  });

  const tabCount = allTabs.length;
  const visibleTabIndices =
    mode === "public"
      ? dedupeFrozenTabIndicesBySnapshotRound(tabCount, frozenSnapshotRounds)
      : allTabs.map((_, i) => i);

  const rows = visibleTabIndices.map((tabIndex) => {
    const heatRow = heatsByTab[tabIndex]!;
    const snapKey = snapshotRoundForTab(tabIndex, tabCount);
    const frozenBlock =
      snapKey && frozenSnapshotRounds?.length
        ? frozenSnapshotRounds.find((r) => normalizeSnapshotRoundKey(r.round) === snapKey)
        : null;
    return {
      tab: allTabs[tabIndex]!,
      individualHeats: heatRow.individualHeats,
      teamHeats: heatRow.teamHeats,
      heatAdvanceQuotas: heatRow.heatAdvanceQuotas,
      marshalDisplayHeatIndices: heatRow.marshalDisplayHeatIndices,
      displaySource: resolveTabDisplaySource(tabIndex, frozenBlock),
      snapshotRoundKey: snapKey,
      previewEstimatedParticipants: heatRow.previewEstimatedParticipants,
      previewMaxLanesPerHeat: heatRow.previewMaxLanesPerHeat,
    };
  });

  return {
    eventHeatSetting,
    allTabs,
    visibleTabIndices,
    rows,
  };
}

export type SnapshotRoundBlockLoose = {
  round: "HEAT" | "SEMI" | "FINAL";
  heats: Array<{
    heatIndex: number;
    participants: unknown[];
  }>;
};

export function getSnapshotTabPanels(
  snapshotRounds: SnapshotRoundBlockLoose[] | null,
  setting: HeatSetting,
  startListRoundCount: number | null | undefined
): Array<{ tabId: string; label: string; block: SnapshotRoundBlockLoose | null }> | null {
  if (!snapshotRounds || snapshotRounds.length === 0) return null;
  const normalized = normalizeRoundTabs(setting);
  const rc =
    typeof startListRoundCount === "number" &&
    Number.isInteger(startListRoundCount) &&
    startListRoundCount >= 1 &&
    startListRoundCount <= 32
      ? Math.min(32, startListRoundCount)
      : null;
  const tabCount = rc !== null ? Math.max(snapshotRounds.length, rc) : snapshotRounds.length;
  const metaTabs = buildRoundTabsForRoundCount(tabCount, normalized);
  const byKey = new Map<StartListRound, SnapshotRoundBlockLoose>();
  for (const block of snapshotRounds) {
    const k = normalizeSnapshotRoundKey(block.round);
    if (k) byKey.set(k, { ...block, heats: [...block.heats].sort((a, b) => a.heatIndex - b.heatIndex) });
  }
  return metaTabs.map((meta, i) => {
    const key = snapshotRoundForTab(i, tabCount);
    const block = key ? (byKey.get(key) ?? null) : null;
    return {
      tabId: `snap-${i}-${meta.id}`,
      label: meta.label,
      block,
    };
  });
}
