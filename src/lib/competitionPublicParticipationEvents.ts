import type { EventCategory } from "@prisma/client";
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";

export type ParticipationEventLite = {
  id: string;
  name: string;
  sex: string;
  type: string;
  /** プール／オーシャンなど。同一種目名でもカテゴリが違えば別行にする */
  category: EventCategory;
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

/**
 * 大会公開ページ「参加情報」の種目一覧用。
 * 同一の種目名・個人/チーム区分で男女別にレコードがある場合は 1 行にまとめる。
 */
export function buildParticipationEventRows(events: ParticipationEventLite[]): ParticipationEventRow[] {
  if (events.length === 0) return [];

  const groupKey = (e: ParticipationEventLite) => `${e.category}\0${e.type}\0${e.name}`;
  const buckets = new Map<string, ParticipationEventLite[]>();
  for (const e of events) {
    const k = groupKey(e);
    const list = buckets.get(k);
    if (list) {
      list.push(e);
    } else {
      buckets.set(k, [e]);
    }
  }

  const orderedKeys: string[] = [];
  for (const e of events) {
    const k = groupKey(e);
    if (!orderedKeys.includes(k)) {
      orderedKeys.push(k);
    }
  }

  return orderedKeys.map((k) => {
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
  });
}

export type ParticipationEventSection = {
  category: EventCategory;
  label: string;
  rows: ParticipationEventRow[];
};

/**
 * 大会公開ページ「参加情報」用。カテゴリ（プール／オーシャン）ごとに行を分け、表示順を整える。
 */
export function buildParticipationEventSections(events: ParticipationEventLite[]): ParticipationEventSection[] {
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
      rows: buildParticipationEventRows(sub),
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
        rows: buildParticipationEventRows(sub),
      });
    }
  }
  return out;
}
