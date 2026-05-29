import { isCallClosedForEvent } from "@/lib/dayOpsCallWindow";
import {
  hasIndividualWithdrawalForEvent,
  type ParticipantStatusRow,
} from "@/lib/entryWithdrawalAdminLabel";

export type WithdrawableEventOption = {
  eventId: string;
  label: string;
  alreadyWithdrawn: boolean;
  callClosed: boolean;
};

export type ParseWithdrawEventIdsResult =
  | { ok: true; eventIds: string[] }
  | { ok: false; message: string };

export function parseWithdrawEventIds(body: unknown): ParseWithdrawEventIdsResult {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "棄権する種目を1件以上選択してください" };
  }
  const raw = (body as { eventIds?: unknown }).eventIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "棄権する種目を1件以上選択してください" };
  }
  const eventIds = [
    ...new Set(
      raw
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    ),
  ];
  if (eventIds.length === 0) {
    return { ok: false, message: "棄権する種目を1件以上選択してください" };
  }
  return { ok: true, eventIds };
}

/** エントリー items のうち個人種目の eventId のみ */
export function filterIndividualEventIdsFromEntry(
  items: { eventId: string }[],
  eventTypeById: ReadonlyMap<string, string>
): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.eventId)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.length > 0 &&
            eventTypeById.get(id) === "INDIVIDUAL"
        )
    ),
  ];
}

export function resolveWithdrawTargetEventIds(args: {
  requestedEventIds: string[];
  allowedIndividualEventIds: readonly string[];
}): { ok: true; eventIds: string[] } | { ok: false; message: string } {
  const allowed = new Set(args.allowedIndividualEventIds);
  if (allowed.size === 0) {
    return { ok: false, message: "申請対象の種目がありません" };
  }
  const invalid = args.requestedEventIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    return { ok: false, message: "選択できない種目が含まれています" };
  }
  return { ok: true, eventIds: args.requestedEventIds };
}

/** 棄権申請の処理対象種目（締切・棄権済みを検証） */
export function resolveWithdrawProcessingEventIds(args: {
  targetEventIds: string[];
  participantStatuses: ParticipantStatusRow[];
  startListSettings: unknown;
  eventLabelById?: ReadonlyMap<string, string>;
}): { ok: true; eventIds: string[] } | { ok: false; message: string } {
  const labelFor = (eventId: string) => args.eventLabelById?.get(eventId) ?? eventId;
  const closedNames: string[] = [];
  const toProcess: string[] = [];

  for (const eventId of args.targetEventIds) {
    if (isCallClosedForEvent(args.startListSettings, eventId)) {
      closedNames.push(labelFor(eventId));
      continue;
    }
    if (hasIndividualWithdrawalForEvent(args.participantStatuses, eventId)) {
      continue;
    }
    toProcess.push(eventId);
  }

  if (closedNames.length > 0) {
    return {
      ok: false,
      message: `召集締切済みのため棄権申請できません: ${closedNames.join("、")}`,
    };
  }
  if (toProcess.length === 0) {
    return { ok: false, message: "申請対象の種目がありません" };
  }
  return { ok: true, eventIds: toProcess };
}

export function buildWithdrawableEventOptions(args: {
  individualEventIds: readonly string[];
  eventLabelById: ReadonlyMap<string, string>;
  participantStatuses: ParticipantStatusRow[];
  startListSettings: unknown;
}): WithdrawableEventOption[] {
  return args.individualEventIds.map((eventId) => ({
    eventId,
    label: args.eventLabelById.get(eventId) ?? eventId,
    alreadyWithdrawn: hasIndividualWithdrawalForEvent(args.participantStatuses, eventId),
    callClosed: isCallClosedForEvent(args.startListSettings, eventId),
  }));
}

export function hasSelectableWithdrawEvents(options: readonly WithdrawableEventOption[]): boolean {
  return options.some((option) => !option.alreadyWithdrawn && !option.callClosed);
}
