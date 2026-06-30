import { resolveAllowedAgeCategoryIds } from "@/lib/competitionEventAgeEligibility";
import { extractTabInnerCompetitionEventName } from "@/lib/competitionEventStoredName";
import { sexOptionLabel, type EventSexOption } from "@/lib/competitionEventSexOption";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";

export function formatEventEligibilitySubtitle(params: {
  event: {
    ageCategoryId?: string | null;
    allowedAgeCategoryIds?: unknown;
    eligibleBirthDateFrom?: Date | string | null;
    eligibleBirthDateTo?: Date | string | null;
  };
  ageCategories: ReadonlyArray<{ id: string; name: string }>;
  useCategoryAllowList: boolean;
}): string {
  const { event, ageCategories, useCategoryAllowList } = params;

  if (useCategoryAllowList) {
    const ids = resolveAllowedAgeCategoryIds(event) ?? [];
    const names = ids.map((id) => ageCategories.find((c) => c.id === id)?.name ?? id);
    return names.length > 0 ? names.join(", ") : "—";
  }

  const from = toEligibleBirthDateInput(event.eligibleBirthDateFrom);
  const to = toEligibleBirthDateInput(event.eligibleBirthDateTo);
  if (!from && !to) return "制限なし";
  if (from && to) return `${from} 〜 ${to}`;
  if (from) return `${from} 〜`;
  return `〜 ${to}`;
}

export function formatEventListRowLabel(params: {
  storedEventName: string;
  ageCategoryName: string | null;
  sexOption: EventSexOption;
  eligibilitySubtitle: string;
}): string {
  const displayName = extractTabInnerCompetitionEventName(
    params.storedEventName,
    params.ageCategoryName
  );
  return `${displayName} · ${sexOptionLabel(params.sexOption)} · ${params.eligibilitySubtitle}`;
}

export function displayEventInnerName(
  storedEventName: string,
  ageCategoryName: string | null | undefined
): string {
  return extractTabInnerCompetitionEventName(storedEventName, ageCategoryName);
}
