import type { ResultRound } from "@prisma/client";
import {
  assignParticipantsInOrderToHeats,
  type StartListHeat,
  type StartListParticipant,
} from "@/lib/startListRounds";

export type StartListRandomFn = () => number;

/** SSR/CSR で同一結果に揃えるためのシード付き乱数 */
export function createStartListRng(seed: number): StartListRandomFn {
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

export function shuffleWithRng<T>(items: T[], rng: StartListRandomFn): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const ROUND_CHAIN: readonly ResultRound[] = ["HEAT", "SEMI", "FINAL"];

/**
 * タブ0は着順参照なし。タブ1→HEAT、タブ2→SEMI、タブ3以降→FINAL の公式着を「直前」として参照。
 */
export function resolvePreviousResultRoundForTab(tabIndex: number): ResultRound | null {
  if (tabIndex <= 0) return null;
  return ROUND_CHAIN[Math.min(tabIndex - 1, ROUND_CHAIN.length - 1)] ?? null;
}

function rankSortKey(rank: number | null | undefined): number {
  if (typeof rank === "number" && Number.isFinite(rank)) return rank;
  return 1_000_000;
}

/** 着順でソートした列をヒート数でロビンに分け、波順で取り出してヒート間で着が散らばるようにする */
function interleaveRoundRobinRankOrder<T>(rankSorted: T[], heatCount: number): T[] {
  if (heatCount <= 1) return [...rankSorted];
  const cols: T[][] = Array.from({ length: heatCount }, () => []);
  rankSorted.forEach((item, i) => {
    cols[i % heatCount]!.push(item);
  });
  const maxLen = Math.max(0, ...cols.map((c) => c.length));
  const out: T[] = [];
  for (let r = 0; r < maxLen; r += 1) {
    for (let h = 0; h < heatCount; h += 1) {
      const cell = cols[h]![r];
      if (cell !== undefined) out.push(cell);
    }
  }
  return out;
}

export type RankedStartListIndividual = {
  entryId: string;
  userId: string;
  name: string;
  clubId: string | null;
  clubName: string | null;
  rank: number | null;
};

export type RankedStartListTeam = {
  teamEntryId: string;
  teamName: string;
  clubId: string | null;
  clubName: string | null;
  members: string[];
  rank: number | null;
};

export type StartListIndividualDisplayItem = {
  entryId: string;
  name: string;
  clubId: string | null;
  clubName: string | null;
};

export type StartListTeamDisplayItem = {
  teamEntryId: string;
  teamName: string;
  clubName?: string | null;
  members: string[];
};

export function shuffleHeatsParticipantsInPlace(heats: StartListHeat[], rng: StartListRandomFn) {
  for (const heat of heats) {
    const shuffled = shuffleWithRng(heat.participants, rng);
    heat.participants.length = 0;
    heat.participants.push(...shuffled);
  }
}

export function buildDispersedIndividualParticipantHeats(params: {
  individuals: RankedStartListIndividual[];
  heatCount: number;
  tabIndex: number;
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  rng: StartListRandomFn;
}): StartListHeat[] {
  const { individuals, heatCount, tabIndex, officialRanksByRound, rng } = params;
  if (heatCount <= 0 || individuals.length === 0) return [];

  const prevRound = resolvePreviousResultRoundForTab(tabIndex);
  const rankMap = prevRound ? officialRanksByRound?.[prevRound] : null;
  const hasUsefulRanks =
    Boolean(rankMap) && Object.keys(rankMap as object).length > 0 && tabIndex > 0;

  const withRanks: RankedStartListIndividual[] = individuals.map((it) => ({
    ...it,
    rank: rankMap?.[it.entryId] ?? null,
  }));

  let rankedSorted: RankedStartListIndividual[];
  if (!hasUsefulRanks) {
    rankedSorted = shuffleWithRng(withRanks, rng);
  } else {
    const decorated = withRanks.map((it) => ({
      it,
      rk: rankSortKey(it.rank),
      tie: rng(),
    }));
    decorated.sort((a, b) => a.rk - b.rk || a.tie - b.tie);
    rankedSorted = decorated.map((d) => d.it);
  }

  const roundRobinQueue = interleaveRoundRobinRankOrder(rankedSorted, heatCount);
  const participants: StartListParticipant[] = roundRobinQueue.map((it) => ({
    kind: "INDIVIDUAL" as const,
    entryId: it.entryId,
    userId: it.userId,
    name: it.name,
    clubId: it.clubId,
    clubName: it.clubName,
  }));

  const heats = assignParticipantsInOrderToHeats(participants, heatCount);
  shuffleHeatsParticipantsInPlace(heats, rng);
  return heats;
}

export function buildDispersedTeamParticipantHeats(params: {
  teams: RankedStartListTeam[];
  heatCount: number;
  tabIndex: number;
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  rng: StartListRandomFn;
}): StartListHeat[] {
  const { teams, heatCount, tabIndex, officialRanksByRound, rng } = params;
  if (heatCount <= 0 || teams.length === 0) return [];

  const prevRound = resolvePreviousResultRoundForTab(tabIndex);
  const rankMap = prevRound ? officialRanksByRound?.[prevRound] : null;
  const hasUsefulRanks =
    Boolean(rankMap) && Object.keys(rankMap as object).length > 0 && tabIndex > 0;

  const withRanks: RankedStartListTeam[] = teams.map((t) => ({
    ...t,
    rank: rankMap?.[t.teamEntryId] ?? null,
  }));

  let rankedSorted: RankedStartListTeam[];
  if (!hasUsefulRanks) {
    rankedSorted = shuffleWithRng(withRanks, rng);
  } else {
    const decorated = withRanks.map((it) => ({
      it,
      rk: rankSortKey(it.rank),
      tie: rng(),
    }));
    decorated.sort((a, b) => a.rk - b.rk || a.tie - b.tie);
    rankedSorted = decorated.map((d) => d.it);
  }

  const roundRobinQueue = interleaveRoundRobinRankOrder(rankedSorted, heatCount);
  const participants: StartListParticipant[] = roundRobinQueue.map((it) => ({
    kind: "TEAM" as const,
    teamEntryId: it.teamEntryId,
    teamName: it.teamName,
    clubId: it.clubId,
    clubName: it.clubName,
    members: it.members,
  }));

  const heats = assignParticipantsInOrderToHeats(participants, heatCount);
  shuffleHeatsParticipantsInPlace(heats, rng);
  return heats;
}

export function individualHeatsToDisplayRows(
  heats: StartListHeat[]
): StartListIndividualDisplayItem[][] {
  return heats.map((h) =>
    h.participants.map((p) => {
      if (p.kind !== "INDIVIDUAL") {
        return { entryId: "", name: "", clubId: null, clubName: null };
      }
      return {
        entryId: p.entryId,
        name: p.name,
        clubId: p.clubId,
        clubName: p.clubName,
      };
    })
  );
}

export function teamHeatsToDisplayRows(heats: StartListHeat[]): StartListTeamDisplayItem[][] {
  return heats.map((h) =>
    h.participants.map((p) => {
      if (p.kind !== "TEAM") {
        return { teamEntryId: "", teamName: "", clubName: null, members: [] };
      }
      return {
        teamEntryId: p.teamEntryId,
        teamName: p.teamName,
        clubName: p.clubName,
        members: p.members,
      };
    })
  );
}

/** ページ用: 安定シード（同一大会・種目・更新単位で並び固定） */
export function computePlacementSeed(
  competitionId: string,
  eventId: string,
  archiveFingerprint: string
): number {
  const s = `${competitionId}:${eventId}:${archiveFingerprint}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
