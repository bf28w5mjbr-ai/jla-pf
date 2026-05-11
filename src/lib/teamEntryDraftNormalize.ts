import { clubTeamNameBaseForClubId } from "@/lib/teamEntryClubBaseName";

/** チームエントリー編集の1行（クライアント下書き） */
export type TeamEntryDraftRow = {
  id: string;
  eventId: string;
  teamName: string;
  persistedId?: string;
};

export type TeamEntryClubLite = {
  id: string;
  name: string;
  abbreviation?: string | null;
};

/** 1→A, 26→Z, 27→AA（列記号と同じく増分） */
export function indexToLetters(index: number): string {
  if (index < 1) return "A";
  let n = index;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/** 同一種目内で1組だけならベースのみ、2組以上なら「ベース A」「ベース B」…にそろえる */
export function normalizeTeamNamesForEvent(
  entries: TeamEntryDraftRow[],
  eventId: string,
  base: string
): TeamEntryDraftRow[] {
  const indices: number[] = [];
  entries.forEach((e, i) => {
    if (e.eventId === eventId) indices.push(i);
  });
  const n = indices.length;
  if (n === 0) return entries;
  const out = [...entries];
  if (n === 1) {
    out[indices[0]] = { ...out[indices[0]], teamName: base };
    return out;
  }
  indices.forEach((entryIdx, k) => {
    out[entryIdx] = {
      ...out[entryIdx],
      teamName: `${base} ${indexToLetters(k + 1)}`,
    };
  });
  return out;
}

/** クラブ内の全種目について、1組ならベースのみ・複数なら A/B… にそろえる */
export function normalizeAllTeamNamesForClub(
  entries: TeamEntryDraftRow[],
  clubId: string,
  clubList: TeamEntryClubLite[]
): TeamEntryDraftRow[] {
  const base = clubTeamNameBaseForClubId(clubId, clubList);
  const eventIds = [...new Set(entries.map((e) => e.eventId))];
  return eventIds.reduce(
    (acc, eventId) => normalizeTeamNamesForEvent(acc, eventId, base),
    [...entries]
  );
}

/**
 * ある種目の下書き行数を target（0以上・呼び出し側で上限クリップ済み）に合わせる。
 */
export function syncDraftListTeamCountForEvent(
  list: TeamEntryDraftRow[],
  eventId: string,
  target: number,
  base: string
): TeamEntryDraftRow[] {
  const current = list.filter((e) => e.eventId === eventId).length;
  if (target === current) return list;

  const next = [...list];
  if (target < current) {
    let toRemove = current - target;
    for (let i = next.length - 1; i >= 0 && toRemove > 0; i--) {
      if (next[i].eventId === eventId) {
        next.splice(i, 1);
        toRemove--;
      }
    }
    return normalizeTeamNamesForEvent(next, eventId, base);
  }
  for (let k = 0; k < target - current; k++) {
    next.push({
      id: `draft-${eventId}-${Date.now()}-${k}-${Math.random().toString(36).slice(2, 10)}`,
      eventId,
      teamName: "",
    });
  }
  return normalizeTeamNamesForEvent(next, eventId, base);
}
