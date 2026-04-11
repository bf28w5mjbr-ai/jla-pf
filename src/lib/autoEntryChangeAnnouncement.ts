export type EventSexOption = "BOTH" | "MALE_ONLY" | "FEMALE_ONLY" | "MIXED_ONLY";

type EventLike = {
  name: string;
  category: string;
  type: string;
  sex: string;
};

export function formatCompetitionDateTimeJa(d: Date): string {
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isPeriodExtension(
  oldStart: Date | null,
  oldEnd: Date | null,
  newStart: Date,
  newEnd: Date
): boolean {
  if (oldEnd && newEnd.getTime() > oldEnd.getTime()) return true;
  if (oldStart && newStart.getTime() < oldStart.getTime()) return true;
  return false;
}

/** 公開済み大会のエントリー期間短縮禁止（サーバー assert と同一文言） */
export const PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE =
  "公開済みの大会では、エントリー受付期間の短縮はできません。";

export function isPeriodShortening(
  oldStart: Date | null,
  oldEnd: Date | null,
  newStart: Date | null,
  newEnd: Date | null
): boolean {
  if (oldEnd && newEnd && newEnd.getTime() < oldEnd.getTime()) return true;
  if (oldStart && newStart && newStart.getTime() > oldStart.getTime()) return true;
  return false;
}

export function buildEntryPeriodExtensionAnnouncement(
  oldStart: Date | null,
  oldEnd: Date | null,
  newStartIso: string,
  newEndIso: string,
  needsNotice: boolean
): string | undefined {
  if (!needsNotice) return undefined;
  const newStart = new Date(newStartIso);
  const newEnd = new Date(newEndIso);
  if (!isPeriodExtension(oldStart, oldEnd, newStart, newEnd)) return undefined;
  return `エントリー受付期間を変更しました。\n・開始: ${formatCompetitionDateTimeJa(newStart)}\n・終了: ${formatCompetitionDateTimeJa(newEnd)}\nエントリー済みの参加者へ周知しました。`;
}

export function normalizeQualificationList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function buildQualificationRelaxAnnouncement(
  oldList: string[],
  newList: string[],
  needsNotice: boolean
): string | undefined {
  if (!needsNotice) return undefined;
  const removed = oldList.filter((q) => !newList.includes(q));
  if (removed.length === 0) return undefined;
  return `出場に必要な資格を変更しました。次の要件は不要になりました：${removed.join("、")}。エントリー済みの参加者へ周知しました。`;
}

export function buildEventAddedAnnouncement(
  eventName: string,
  needsNotice: boolean
): string | undefined {
  if (!needsNotice) return undefined;
  return `種目「${eventName}」をエントリー対象に追加しました。エントリー済みの参加者へ周知しました。`;
}

export function buildBulkEventsAddedAnnouncement(
  count: number,
  categoryLabel: string,
  typeLabel: string,
  needsNotice: boolean
): string | undefined {
  if (!needsNotice || count < 1) return undefined;
  return `${categoryLabel}${typeLabel}種目を${count}件追加しました。エントリー済みの参加者へ周知しました。`;
}

/** 性別区分変更で「新しい性別の種目行」が増えるか（サーバの sexesToAdd に相当） */
export function eventSexOptionAddsGenders(
  events: EventLike[],
  event: Pick<EventLike, "name" | "category" | "type">,
  nextOption: EventSexOption
): boolean {
  const requestedSexes: Array<"MALE" | "FEMALE" | "OTHER"> =
    nextOption === "MALE_ONLY"
      ? ["MALE"]
      : nextOption === "FEMALE_ONLY"
        ? ["FEMALE"]
        : nextOption === "MIXED_ONLY"
          ? ["OTHER"]
          : ["MALE", "FEMALE"];
  const current = new Set(
    events
      .filter(
        (e) =>
          e.name === event.name && e.category === event.category && e.type === event.type
      )
      .map((e) => e.sex as "MALE" | "FEMALE" | "OTHER")
  );
  return requestedSexes.some((sex) => !current.has(sex));
}

export function buildEventSexOptionExpandAnnouncement(
  eventName: string,
  needsNotice: boolean
): string | undefined {
  if (!needsNotice) return undefined;
  return `種目「${eventName}」の性別区分を変更し、参加可能な区分を追加しました。エントリー済みの参加者へ周知しました。`;
}
