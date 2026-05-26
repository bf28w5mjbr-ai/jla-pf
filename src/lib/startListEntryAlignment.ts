import { shouldHideFromStartListLineupParticipantRow } from "@/lib/dayOpsParticipantStatusDisplay";

export type AlignmentParticipantStatusRow = {
  eventId: string;
  status: string;
  reason: string | null;
  participantType?: string;
  competitionEntryId?: string | null;
  teamEntryId?: string | null;
};

/** 現行 EntryItem の種目 ID（スタートリスト・CSV 整合用。スナップショットは使わない） */
export function getLiveIndividualEventIdsFromEntry(
  items: ReadonlyArray<{ eventId: string }>
): string[] {
  const ids = items
    .map((item) => item.eventId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

function individualStatusRowsForEvent(
  participantStatuses: ReadonlyArray<AlignmentParticipantStatusRow>,
  eventId: string
): AlignmentParticipantStatusRow[] {
  return participantStatuses.filter(
    (row) =>
      row.eventId === eventId &&
      (row.participantType == null || row.participantType === "INDIVIDUAL")
  );
}

/** 当該種目がスタートリスト掲載対象として○を付けるか（live 登録かつ棄権等で非表示でない） */
export function isEventMarkedForStartListAlignment(
  eventId: string,
  liveEventIds: ReadonlySet<string>,
  participantStatuses: ReadonlyArray<AlignmentParticipantStatusRow>
): boolean {
  if (!liveEventIds.has(eventId)) return false;
  const rows = individualStatusRowsForEvent(participantStatuses, eventId);
  return !rows.some((row) =>
    shouldHideFromStartListLineupParticipantRow({ status: row.status, reason: row.reason })
  );
}

/** 個人CSVの種目列用（program 順の ○ / 空文字） */
export function buildIndividualEventCircleCells(
  programOrderedEventIds: ReadonlyArray<string>,
  liveEventIds: ReadonlySet<string>,
  participantStatuses: ReadonlyArray<AlignmentParticipantStatusRow>
): string[] {
  return programOrderedEventIds.map((eventId) =>
    isEventMarkedForStartListAlignment(eventId, liveEventIds, participantStatuses) ? "○" : ""
  );
}

/** 団体エントリーがスタートリスト出場者一覧から除外されるか */
export function shouldHideTeamEntryFromStartListAlignment(
  teamEntryId: string,
  eventId: string,
  participantStatuses: ReadonlyArray<AlignmentParticipantStatusRow>
): boolean {
  const rows = participantStatuses.filter(
    (row) =>
      row.participantType === "TEAM" &&
      row.teamEntryId === teamEntryId &&
      row.eventId === eventId
  );
  return rows.some((row) =>
    shouldHideFromStartListLineupParticipantRow({ status: row.status, reason: row.reason })
  );
}
