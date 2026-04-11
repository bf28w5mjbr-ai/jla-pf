/** スナップショット／DB 用の内部識別子（最大3種）。UI タブ位置から割り当てられ、競技の「予選」等と一致しない場合がある。 */
export type StartListRound = "HEAT" | "SEMI" | "FINAL";

export type StartListParticipant =
  | {
      kind: "INDIVIDUAL";
      entryId: string;
      userId: string;
      name: string;
      clubId: string | null;
      clubName: string | null;
      sourceRank?: number | null;
      sourceHeat?: number | null;
    }
  | {
      kind: "TEAM";
      teamEntryId: string;
      teamName: string;
      clubId: string | null;
      clubName: string | null;
      members: string[];
      sourceRank?: number | null;
      sourceHeat?: number | null;
    };

export type StartListHeat = {
  heatIndex: number;
  participants: StartListParticipant[];
};

/** 次ラ参加者の sourceHeat（前ラ公式ヒート）ごとの人数。記録用 */
export function countStartListParticipantsBySourceHeat(
  participants: StartListParticipant[]
): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of participants) {
    const h = p.sourceHeat;
    if (typeof h !== "number" || !Number.isFinite(h) || h < 1) continue;
    m.set(h, (m.get(h) ?? 0) + 1);
  }
  return m;
}

export type StartListRoundData = {
  round: StartListRound;
  generatedAt: string;
  generatedBy: "ENTRY_CLOSE" | "RESULT_BASED" | "RECORD_CAPTURE" | "BASELINE";
  sourceRound?: StartListRound;
  heats: StartListHeat[];
  /**
   * 次ラウンド生成後に付与。各前ラヒートの進出**上限**（quota）と、着順確定後に実際に拾った人数（actual、任意）。
   */
  advanceQuotasByOfficialHeat?: { heat: number; quota: number; actual?: number }[];
};

type HeatSetting = {
  mode?: "count" | "size";
  heatCount?: string;
  heatSize?: string;
};

export function resolveHeatCount(total: number, setting?: HeatSetting) {
  if (total === 0) return 0;
  if (setting?.mode === "size") {
    const size = Math.max(1, parseInt(setting.heatSize || "1", 10));
    return Math.max(1, Math.ceil(total / size));
  }
  const count = Math.max(1, parseInt(setting?.heatCount || "1", 10));
  return count;
}

/**
 * 前ラウンド各ヒートの人数に比例し、合計ちょうど capacity 人が次ラウンドに進むよう各ヒートのアップ数を整数配分する（最大剰余法）。
 * 各値は sourceHeatSizes[i] を超えない。
 */
export function computeAdvanceCountsByLargestRemainder(
  sourceHeatSizes: number[],
  capacity: number
): number[] {
  const n = sourceHeatSizes.length;
  if (n === 0) return [];
  const total = sourceHeatSizes.reduce((a, b) => a + b, 0);
  const cap = Math.max(0, Math.min(capacity, total));
  if (cap === 0) return sourceHeatSizes.map(() => 0);
  if (cap >= total) return [...sourceHeatSizes];

  const raw = sourceHeatSizes.map((s) => (cap * s) / total);
  const floors = raw.map((x) => Math.floor(x));
  const adv = [...floors];
  const rem = cap - floors.reduce((a, b) => a + b, 0);
  const order = sourceHeatSizes
    .map((_, i) => i)
    .sort((i, j) => {
      const fi = raw[i] - floors[i];
      const fj = raw[j] - floors[j];
      if (fj !== fi) return fj - fi;
      return i - j;
    });
  for (let k = 0; k < rem; k += 1) {
    adv[order[k]] += 1;
  }

  for (let i = 0; i < n; i += 1) {
    adv[i] = Math.min(adv[i], sourceHeatSizes[i]);
  }

  let short = cap - adv.reduce((a, b) => a + b, 0);
  while (short > 0) {
    let best = -1;
    let bestRoom = 0;
    for (let j = 0; j < n; j += 1) {
      const room = sourceHeatSizes[j] - adv[j];
      if (room > bestRoom) {
        bestRoom = room;
        best = j;
      }
    }
    if (best < 0 || bestRoom === 0) break;
    adv[best] += 1;
    short -= 1;
  }

  return adv;
}

/**
 * 総枠 `capacity` をヒート数で可能な限り均等配分（余りは先頭ヒートから 1 名ずつ多く振る）。
 * 各ヒートの上限は `sourceHeatSizes[i]`（そのヒートの進出対象人数）。足りない分は余裕のあるヒートへ再配分する。
 * 例: capacity=48・7 ヒート・各ヒートに十分な人数 → [7,7,7,7,7,7,6]
 */
export function computeAdvanceCountsEqualAcrossHeats(
  sourceHeatSizes: number[],
  capacity: number
): number[] {
  const n = sourceHeatSizes.length;
  if (n === 0) return [];
  const totalEligible = sourceHeatSizes.reduce((a, b) => a + b, 0);
  const cap = Math.max(0, Math.min(capacity, totalEligible));
  if (cap === 0) return sourceHeatSizes.map(() => 0);
  if (cap >= totalEligible) return [...sourceHeatSizes];

  const base = Math.floor(cap / n);
  const rem = cap % n;
  const target = sourceHeatSizes.map((_, i) => base + (i < rem ? 1 : 0));
  const adv = target.map((t, i) => Math.min(t, sourceHeatSizes[i]!));
  let short = cap - adv.reduce((a, b) => a + b, 0);

  while (short > 0) {
    let best = -1;
    let bestKey = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j += 1) {
      const room = sourceHeatSizes[j]! - adv[j]!;
      if (room <= 0) continue;
      const key = adv[j]! * 1000 + j;
      if (key < bestKey) {
        bestKey = key;
        best = j;
      }
    }
    if (best < 0) break;
    adv[best]! += 1;
    short -= 1;
  }

  return adv;
}

/**
 * 各ヒートの実人数（マーシャル済み人数など）に依存せず、種目の最大レーン数 L を各ヒートの上限として
 * 総枠 `capacity` をヒート間で均等配分する（{@link computeAdvanceCountsEqualAcrossHeats} の仮想サイズを全ヒート L）。
 * 実際の進出者は呼び出し側の `collectAdvancersPerHeatByRank` 等で、枠より少ないヒートはその分だけ少なくなる。
 */
export function computeAdvanceCountsByLaneSlotsPerHeat(
  heatCount: number,
  maxLanesPerHeat: number,
  capacity: number
): number[] {
  const n = Math.max(0, Math.floor(heatCount));
  if (n === 0) return [];
  const L = Math.min(64, Math.max(1, Math.floor(maxLanesPerHeat)));
  const uniformSizes = Array.from({ length: n }, () => L);
  return computeAdvanceCountsEqualAcrossHeats(uniformSizes, capacity);
}

/**
 * 次ラウンド側のヒート数 H と最大レーン L から、前ラから埋めうる**進出枠の合計**（物理定員 H×L）を返す。
 * この値を {@link computeAdvanceCountsByLaneSlotsPerHeat} で現ラのヒート数に均等割りする（完走者数で総枠を削らない）。
 * 実際に次ラへ載る人数は `collectAdvancersPerHeatByRank` 等で進出対象者のみが拾われ、総枠を下回りうる。
 *
 * @param _totalRowsInFinishedRound 後方互換のため残す（参照しない）
 */
export function totalAdvanceCapacityFromNextRoundLayout(
  nextHeatCount: number,
  maxLanesPerHeat: number,
  _totalRowsInFinishedRound?: number
): number {
  void _totalRowsInFinishedRound;
  const H = Math.max(0, Math.floor(nextHeatCount));
  const L = Math.max(1, Math.floor(maxLanesPerHeat));
  return Math.max(0, H * L);
}

export type RankedHeatRow = { rank: number | null };

/**
 * 前ラウンド各ヒートについて、**着順が確定している行（rank あり）のみ**を対象に、rank 昇順で上位 take[i] 名を集める。
 * take は各ヒートの進出**上限**であり、マーシャル未完了・着順未入力で人数が足りなければそのヒートからはその分だけ少なくなる（null rank を繰り上げて枠を埋めない）。
 * 次ラウンドに載せるのはこの配列の選手のみ。その後 {@link buildNextRoundHeatsFromPreviousResults} で次ラのヒート数に分割する。
 */
export function collectAdvancersPerHeatByRank<T extends RankedHeatRow>(
  heatEntries: [heatKey: number, rows: T[]][],
  takePerHeat: number[]
): T[] {
  return heatEntries.flatMap(([, rows], i) => {
    const take = takePerHeat[i] ?? 0;
    if (take <= 0) return [] as T[];
    const ranked = rows
      .filter((r) => r.rank != null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    return ranked.slice(0, take);
  });
}

/**
 * 従来モード: 各前ラヒートから、**rank あり**の行だけを着順で並べ、上位 n 名を集める（n は上限で実人数が少なければそのまま）。
 */
export function collectUniformTopPerHeat<T extends RankedHeatRow>(
  heatEntries: [heatKey: number, rows: T[]][],
  topN: number
): T[] {
  const n = Math.max(1, topN);
  return heatEntries.flatMap(([, rows]) => {
    const ranked = rows
      .filter((r) => r.rank != null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    return ranked.slice(0, Math.min(n, ranked.length));
  });
}

/**
 * 種目の「1レースあたりの最大レーン数」L（全ラウンド共通）を上限とし、各ヒートに最大 L 人まで収めるのに必要な
 * **最小ヒート数** H = ceil(n / L) を返す（1ヒートあたりの人数を大きくしつつレーン上限を守る）。
 * 例: 100人・16レーン → 7ヒート（15,15,14,…）。
 * @returns ヒート数。未設定・無効な L のときは null（呼び出し側でスタートリスト設定にフォールバック）
 */
export function computeHeatCountFromMaxLanes(
  total: number,
  maxLanesPerHeat: number | null | undefined
): number | null {
  if (total <= 0) return 0;
  if (typeof maxLanesPerHeat !== "number" || !Number.isFinite(maxLanesPerHeat)) {
    return null;
  }
  const L = Math.min(64, Math.max(1, Math.floor(maxLanesPerHeat)));
  return Math.max(1, Math.ceil(total / L));
}

/**
 * 最大レーン数 L が有効なとき、各ヒートの人数が L を超えないよう
 * ヒート数を少なくとも ceil(n/L) に引き上げる（手動ヒート数・次ラ以降の分割でも共通適用）。
 * L 未設定時は heatCount をそのまま返す（上限 64）。
 */
export function enforceMinHeatCountForMaxLanes(
  total: number,
  heatCount: number,
  maxLanesPerHeat: number | null | undefined
): number {
  if (total <= 0) {
    return Math.max(0, heatCount);
  }
  const safeBase = Math.max(1, heatCount);
  if (
    typeof maxLanesPerHeat !== "number" ||
    !Number.isFinite(maxLanesPerHeat) ||
    maxLanesPerHeat < 1
  ) {
    return Math.min(64, safeBase);
  }
  const L = Math.min(64, Math.max(1, Math.floor(maxLanesPerHeat)));
  const minHeats = Math.max(1, Math.ceil(total / L));
  return Math.min(64, Math.max(safeBase, minHeats));
}

/**
 * 先頭ラウンドのヒート分割: 種目の「1レースあたりの最大レーン数」（全ラウンド共通）が有効なときは常にレーン上限ベース（ceil(n/L) ヒート）。
 * 未設定時のみ保存されている先頭タブの mode / heatCount / heatSize を使う。
 */
export function effectiveHeatSettingForFirstStartListRound(
  tab: { mode?: "count" | "size"; heatCount?: string; heatSize?: string },
  maxLanesPerHeat: number | null | undefined
): HeatSetting {
  if (
    typeof maxLanesPerHeat === "number" &&
    Number.isFinite(maxLanesPerHeat) &&
    maxLanesPerHeat >= 1
  ) {
    const L = Math.min(64, Math.floor(maxLanesPerHeat));
    return { mode: "size", heatSize: String(Math.max(1, L)), heatCount: "1" };
  }
  return { mode: tab.mode, heatCount: tab.heatCount, heatSize: tab.heatSize };
}

function shuffle<T>(items: T[]) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getClubKey(item: StartListParticipant) {
  if (item.clubId) return `club:${item.clubId}`;
  if (item.clubName) return `name:${item.clubName}`;
  return "none";
}

function emptyHeats(heatCount: number): StartListHeat[] {
  return Array.from({ length: heatCount }, (_, i) => ({
    heatIndex: i + 1,
    participants: [],
  }));
}

function chooseBestHeat(
  heats: StartListHeat[],
  item: StartListParticipant,
  preferredHeatIndex?: number | null,
  tieBreakRng?: () => number
) {
  return chooseBestHeatWithRoom(
    heats,
    heats.map(() => Number.POSITIVE_INFINITY),
    item,
    preferredHeatIndex,
    tieBreakRng
  );
}

/** room[i] までなら入れる。Infinity なら定員なし（従来の chooseBestHeat と同等） */
function chooseBestHeatWithRoom(
  heats: StartListHeat[],
  room: number[],
  item: StartListParticipant,
  preferredHeatIndex?: number | null,
  tieBreakRng?: () => number
) {
  const clubKey = getClubKey(item);
  const candidates: number[] = [];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < heats.length; i += 1) {
    if (room[i] <= 0) continue;
    const heat = heats[i];
    const sameClubCount = heat.participants.filter((p) => getClubKey(p) === clubKey).length;
    const sizePenalty = heat.participants.length * 10;
    const preferredPenalty =
      typeof preferredHeatIndex === "number" ? (i === preferredHeatIndex ? 0 : 1) : 0;
    const score = sameClubCount * 100 + sizePenalty + preferredPenalty;
    if (score < bestScore) {
      bestScore = score;
      candidates.length = 0;
      candidates.push(i);
    } else if (score === bestScore) {
      candidates.push(i);
    }
  }

  if (candidates.length === 0) {
    for (let i = 0; i < heats.length; i += 1) {
      if (room[i] > 0) return i;
    }
    return 0;
  }

  if (candidates.length === 1 || !tieBreakRng) {
    return candidates[0]!;
  }
  return candidates[Math.floor(tieBreakRng() * candidates.length)]!;
}

/**
 * n 人を heatCount ヒートに分けるとき、各ヒート人数の差が最大 1 になる配分（大きいヒートを前に寄せる）。
 * 例: 100人・7ヒート → [15,15,14,14,14,14,14]
 */
export function computeBalancedHeatTargetSizes(n: number, heatCount: number): number[] {
  if (heatCount <= 0 || n <= 0) return [];
  const base = Math.floor(n / heatCount);
  const rem = n % heatCount;
  return Array.from({ length: heatCount }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * 既に意図順に並べたキューを順に入れつつ、ヒート間で同一クラブの偏りを抑える。
 * （着順ロビン後のクラブ寄せなどに使う）
 */
export function assignParticipantsInOrderToHeats(
  orderedParticipants: StartListParticipant[],
  heatCount: number
): StartListHeat[] {
  if (heatCount <= 0 || orderedParticipants.length === 0) return [];
  const heats = emptyHeats(heatCount);
  const targets = computeBalancedHeatTargetSizes(orderedParticipants.length, heatCount);
  const room = [...targets];
  let cursor = 0;
  for (const p of orderedParticipants) {
    const idx = chooseBestHeatWithRoom(heats, room, p, cursor % heatCount);
    heats[idx].participants.push(p);
    room[idx] -= 1;
    cursor += 1;
  }
  return heats;
}

export function buildInitialHeatsWithClubDispersion(
  participants: StartListParticipant[],
  heatCount: number
) {
  if (heatCount <= 0 || participants.length === 0) return [] as StartListHeat[];
  const heats = emptyHeats(heatCount);
  const targets = computeBalancedHeatTargetSizes(participants.length, heatCount);
  const room = [...targets];

  const buckets = new Map<string, StartListParticipant[]>();
  for (const participant of participants) {
    const key = getClubKey(participant);
    const list = buckets.get(key) ?? [];
    list.push(participant);
    buckets.set(key, list);
  }
  const bucketEntries = shuffle(Array.from(buckets.entries())).map(([key, list]) => ({
    key,
    list: shuffle(list),
  }));

  let cursor = 0;
  let hasRemaining = true;
  while (hasRemaining) {
    hasRemaining = false;
    for (const bucket of bucketEntries) {
      const next = bucket.list.pop();
      if (!next) continue;
      hasRemaining = true;
      const idx = chooseBestHeatWithRoom(heats, room, next, cursor % heatCount);
      heats[idx].participants.push(next);
      room[idx] -= 1;
      cursor += 1;
    }
  }

  return heats;
}

function buildSnakePreferredOrder(heatCount: number, total: number) {
  if (heatCount <= 1) return Array.from({ length: total }, () => 0);
  const order: number[] = [];
  let direction: 1 | -1 = 1;
  let idx = 0;
  for (let i = 0; i < total; i += 1) {
    order.push(idx);
    if (direction === 1) {
      if (idx >= heatCount - 1) {
        direction = -1;
        idx = Math.max(0, idx - 1);
      } else {
        idx += 1;
      }
    } else if (idx <= 0) {
      direction = 1;
      idx = Math.min(heatCount - 1, idx + 1);
    } else {
      idx -= 1;
    }
  }
  return order;
}

function nextRoundRankSortKey(p: StartListParticipant): number {
  const r = p.sourceRank;
  return typeof r === "number" && Number.isFinite(r) ? r : 1_000_000;
}

/** 次ラシャッフル用の決定シード（呼び出し側は {@link computePlacementSeed} でも可） */
export function hashNextRoundShuffleSeed(
  competitionId: string,
  eventId: string,
  transition: string,
  participantIdsSortedCsv: string
): number {
  const s = `${competitionId}:${eventId}:${transition}:${participantIdsSortedCsv}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 1;
}

function createNextRoundShuffleRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * 着順キーが同じ連続区間だけ順序をシャッフルする（着順の大小関係は維持）。
 * その後もスネーク優先＋クラブ分散の割当はそのまま。
 */
function shuffleWithinIdenticalRankBuckets(
  sortedByRankThenHeat: StartListParticipant[],
  rng: () => number
): StartListParticipant[] {
  const out: StartListParticipant[] = [];
  let i = 0;
  while (i < sortedByRankThenHeat.length) {
    const k = nextRoundRankSortKey(sortedByRankThenHeat[i]!);
    let j = i + 1;
    while (
      j < sortedByRankThenHeat.length &&
      nextRoundRankSortKey(sortedByRankThenHeat[j]!) === k
    ) {
      j += 1;
    }
    const slice = sortedByRankThenHeat.slice(i, j);
    shuffleInPlace(slice, rng);
    out.push(...slice);
    i = j;
  }
  return out;
}

/**
 * 前ラ着順（＋同着時は元ヒート）でソートしたあと、**同一着順の連続ブロック内だけ**をシード付きでシャッフルする。
 * その列をスネーク優先ヒント＋クラブ分散でヒートに割り付ける。同点タイブレークは複数候補から RNG で選択。
 */
export function buildNextRoundHeatsFromPreviousResults(params: {
  participants: StartListParticipant[];
  heatCount: number;
  /**
   * 同一着順グループ内のシャッフルおよび分散の同点解消用。未指定時は参加者 ID（ソート済み）と heatCount から決定（同一セットなら同じ並び）。
   */
  shuffleSeed?: number;
}) {
  const { participants, heatCount, shuffleSeed } = params;
  if (heatCount <= 0 || participants.length === 0) return [] as StartListHeat[];

  const ranked = [...participants].sort((a, b) => {
    const aRank = typeof a.sourceRank === "number" ? a.sourceRank : Number.POSITIVE_INFINITY;
    const bRank = typeof b.sourceRank === "number" ? b.sourceRank : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    const aHeat = typeof a.sourceHeat === "number" ? a.sourceHeat : Number.POSITIVE_INFINITY;
    const bHeat = typeof b.sourceHeat === "number" ? b.sourceHeat : Number.POSITIVE_INFINITY;
    if (aHeat !== bHeat) return aHeat - bHeat;
    return 0;
  });

  const idCsv = [...participants]
    .map((p) => (p.kind === "INDIVIDUAL" ? p.entryId : p.teamEntryId))
    .sort()
    .join(",");
  const seed =
    typeof shuffleSeed === "number" && Number.isFinite(shuffleSeed)
      ? shuffleSeed >>> 0
      : hashNextRoundShuffleSeed("_", "_", `hc=${heatCount}`, idCsv);
  const rng = createNextRoundShuffleRng(seed ^ 0x3c6e_f372);
  const ordered = shuffleWithinIdenticalRankBuckets(ranked, rng);

  const preferred = buildSnakePreferredOrder(heatCount, ordered.length);
  const heats = emptyHeats(heatCount);
  const total = ordered.length;
  if (heatCount > 0 && total % heatCount === 0) {
    const room = [...computeBalancedHeatTargetSizes(total, heatCount)];
    ordered.forEach((participant, index) => {
      const idx = chooseBestHeatWithRoom(heats, room, participant, preferred[index] ?? null, rng);
      heats[idx].participants.push(participant);
      room[idx] -= 1;
    });
    return heats;
  }
  ordered.forEach((participant, index) => {
    const idx = chooseBestHeat(heats, participant, preferred[index] ?? null, rng);
    heats[idx].participants.push(participant);
  });

  return heats;
}

export function reorderRounds(rounds: StartListRoundData[]) {
  const order: StartListRound[] = ["HEAT", "SEMI", "FINAL"];
  return [...rounds].sort((a, b) => order.indexOf(a.round) - order.indexOf(b.round));
}

/** 次ラウンドをマージし、進出元ラウンドにヒート別アップ数を記録する */
export function mergeSnapshotRoundsWithNextRoundAndAdvanceQuotas(params: {
  prevRounds: StartListRoundData[];
  nextRoundData: StartListRoundData;
  fromRound: StartListRound;
  advanceQuotasByOfficialHeat: { heat: number; quota: number; actual?: number }[];
}): StartListRoundData[] {
  const { prevRounds, nextRoundData, fromRound, advanceQuotasByOfficialHeat } = params;
  const filtered = prevRounds.filter((round) => round.round !== nextRoundData.round);
  const merged = reorderRounds([...filtered, nextRoundData]);
  return merged.map((r) =>
    r.round === fromRound ? { ...r, advanceQuotasByOfficialHeat } : r
  );
}
