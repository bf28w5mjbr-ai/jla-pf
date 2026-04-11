import type { EventCategory } from "@prisma/client";
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";

export type ParticipationEventAgeCategoryLite = {
  id: string;
  name: string;
  displayOrder: number;
};

export type ParticipationEventLite = {
  id: string;
  name: string;
  sex: string;
  type: string;
  /** プール／オーシャンなど。同一種目名でもカテゴリが違えば別行にする */
  category: EventCategory;
  /** 種目に紐づく年齢カテゴリ（未設定のとき null） */
  ageCategory: ParticipationEventAgeCategoryLite | null;
  scheduledStartAt: Date | null;
};

export function competitionEventCategoryPublicLabel(category: EventCategory): string {
  switch (category) {
    case "POOL":
      return "プール競技";
    case "OCEAN":
      return "オーシャン競技";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function sexWord(sex: string): string {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
}

/** 同一種目（名前＋個人/チーム）内の性別を、重複なく読みやすく連結 */
function combineSexLabels(sexes: string[]): string {
  const unique = [...new Set(sexes)];
  if (unique.length === 1) {
    return sexWord(unique[0]!);
  }
  const order = ["MALE", "FEMALE", "OTHER"];
  unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return unique.map((s) => sexWord(s)).join("・");
}

function typeWord(type: string): string {
  return type === "TEAM" ? "チーム" : "個人";
}

function formatScheduleLine(group: ParticipationEventLite[]): string | null {
  const parts = group
    .map((e) => ({
      sex: e.sex,
      text: formatEventStartJa(e.scheduledStartAt),
    }))
    .filter((p) => p.text);

  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return parts[0]!.text;
  }

  const times = parts.map((p) => p.text);
  if (new Set(times).size === 1) {
    return times[0]!;
  }

  return parts.map((p) => `${sexWord(p.sex)} ${p.text}`).join(" · ");
}

export type ParticipationEventRow = {
  key: string;
  name: string;
  metaLine: string;
  scheduleLine: string | null;
};

function compareJaEventName(a: string, b: string): number {
  return a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" });
}

function sortEventsByJaName(events: ParticipationEventLite[]): ParticipationEventLite[] {
  return [...events].sort(
    (x, y) => compareJaEventName(x.name, y.name) || x.id.localeCompare(y.id)
  );
}

function sortRowsByJaName(rows: ParticipationEventRow[]): ParticipationEventRow[] {
  return [...rows].sort(
    (x, y) => compareJaEventName(x.name, y.name) || x.key.localeCompare(y.key)
  );
}

/**
 * 大会公開ページ「参加情報」の種目一覧用。
 * 同一の種目名・個人/チーム区分で男女別にレコードがある場合は 1 行にまとめる。
 */
export function buildParticipationEventRows(events: ParticipationEventLite[]): ParticipationEventRow[] {
  if (events.length === 0) return [];

  const sorted = sortEventsByJaName(events);

  const groupKey = (e: ParticipationEventLite) => `${e.category}\0${e.type}\0${e.name}`;
  const buckets = new Map<string, ParticipationEventLite[]>();
  for (const e of sorted) {
    const k = groupKey(e);
    const list = buckets.get(k);
    if (list) {
      list.push(e);
    } else {
      buckets.set(k, [e]);
    }
  }

  const orderedKeys: string[] = [];
  for (const e of sorted) {
    const k = groupKey(e);
    if (!orderedKeys.includes(k)) {
      orderedKeys.push(k);
    }
  }

  return sortRowsByJaName(
    orderedKeys.map((k) => {
    const g = buckets.get(k)!;
    const name = g[0]!.name;
    const type = g[0]!.type;
    const sexPart = combineSexLabels(g.map((x) => x.sex));
    const metaLine = `${sexPart} · ${typeWord(type)}`;
    return {
      key: g.map((x) => x.id).join("-"),
      name,
      metaLine,
      scheduleLine: formatScheduleLine(g),
    };
    })
  );
}

const AGE_BLOCK_UNASSIGNED_KEY = "__unassigned__";

export type ParticipationEventAgeBlock = {
  key: string;
  title: string;
  rows: ParticipationEventRow[];
};

export type ParticipationEventSection = {
  category: EventCategory;
  label: string;
  ageBlocks: ParticipationEventAgeBlock[];
};

function buildAgeBlocksForCategory(
  sub: ParticipationEventLite[],
  competitionAgeCategories: readonly ParticipationEventAgeCategoryLite[]
): ParticipationEventAgeBlock[] {
  if (sub.length === 0) return [];

  const byAgeId = new Map<string | null, ParticipationEventLite[]>();
  for (const e of sub) {
    const id = e.ageCategory?.id ?? null;
    const list = byAgeId.get(id) ?? [];
    list.push(e);
    byAgeId.set(id, list);
  }

  const blocks: ParticipationEventAgeBlock[] = [];
  const seen = new Set<string>();

  for (const ac of competitionAgeCategories) {
    const list = byAgeId.get(ac.id);
    if (!list?.length) continue;
    seen.add(ac.id);
    blocks.push({
      key: ac.id,
      title: ac.name,
      rows: buildParticipationEventRows(list),
    });
  }

  const orphanIds = [...byAgeId.keys()].filter((k): k is string => k != null && !seen.has(k));
  orphanIds.sort((a, b) => {
    const ea = byAgeId.get(a)![0]!.ageCategory;
    const eb = byAgeId.get(b)![0]!.ageCategory;
    const oa = ea?.displayOrder ?? 0;
    const ob = eb?.displayOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return compareJaEventName(ea?.name ?? a, eb?.name ?? b);
  });
  for (const id of orphanIds) {
    const list = byAgeId.get(id)!;
    const title = list[0]!.ageCategory?.name ?? "年齢カテゴリ";
    blocks.push({ key: id, title, rows: buildParticipationEventRows(list) });
  }

  const unassigned = byAgeId.get(null);
  if (unassigned?.length) {
    blocks.push({
      key: AGE_BLOCK_UNASSIGNED_KEY,
      title: "年齢カテゴリ未設定",
      rows: buildParticipationEventRows(unassigned),
    });
  }

  return blocks;
}

/**
 * 大会公開ページ「参加情報」用。
 * カテゴリ（プール／オーシャン）ごとに分け、その中を年齢カテゴリ別の枠にし、種目名は日本語の読み順で並べる。
 */
export function buildParticipationEventSections(
  events: ParticipationEventLite[],
  competitionAgeCategories: readonly ParticipationEventAgeCategoryLite[]
): ParticipationEventSection[] {
  if (events.length === 0) return [];
  const primaryOrder: EventCategory[] = ["POOL", "OCEAN"];
  const used = new Set<EventCategory>();
  const out: ParticipationEventSection[] = [];
  for (const cat of primaryOrder) {
    const sub = events.filter((e) => e.category === cat);
    if (sub.length === 0) continue;
    used.add(cat);
    out.push({
      category: cat,
      label: competitionEventCategoryPublicLabel(cat),
      ageBlocks: buildAgeBlocksForCategory(sub, competitionAgeCategories),
    });
  }
  const rest = events.filter((e) => !used.has(e.category));
  if (rest.length > 0) {
    const extraCats = [...new Set(rest.map((e) => e.category))];
    for (const cat of extraCats) {
      const sub = rest.filter((e) => e.category === cat);
      out.push({
        category: cat,
        label: competitionEventCategoryPublicLabel(cat),
        ageBlocks: buildAgeBlocksForCategory(sub, competitionAgeCategories),
      });
    }
  }
  return out;
}

export function isUnassignedParticipationAgeBlock(block: ParticipationEventAgeBlock): boolean {
  return block.key === AGE_BLOCK_UNASSIGNED_KEY;
}
