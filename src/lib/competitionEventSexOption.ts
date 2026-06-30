import type { EventCategory, EventType, Sex } from "@prisma/client";

export type EventSexOption = "BOTH" | "MALE_ONLY" | "FEMALE_ONLY" | "MIXED_ONLY";

export function sexOptionLabel(sexOption: EventSexOption): string {
  if (sexOption === "MALE_ONLY") return "男子";
  if (sexOption === "FEMALE_ONLY") return "女子";
  if (sexOption === "MIXED_ONLY") return "混合";
  return "男女";
}

export function sexesForSexOption(
  sexOption: EventSexOption
): ReadonlyArray<"MALE" | "FEMALE" | "OTHER"> {
  if (sexOption === "MALE_ONLY") return ["MALE"] as const;
  if (sexOption === "FEMALE_ONLY") return ["FEMALE"] as const;
  if (sexOption === "MIXED_ONLY") return ["OTHER"] as const;
  return ["MALE", "FEMALE"] as const;
}

export function parseEventSexOption(raw: unknown): EventSexOption | null {
  if (
    raw === "BOTH" ||
    raw === "MALE_ONLY" ||
    raw === "FEMALE_ONLY" ||
    raw === "MIXED_ONLY"
  ) {
    return raw;
  }
  return null;
}

export function eventCardGroupKey(event: Pick<{ category: EventCategory; type: EventType; name: string }, "category" | "type" | "name">) {
  return `${event.category}:${event.type}:${event.name}`;
}

export function getEventSexOptionFromEvents(
  events: ReadonlyArray<{ name: string; category: EventCategory; type: EventType; sex: Sex }>,
  eventName: string,
  category: EventCategory,
  type: EventType
): EventSexOption {
  const sexes = new Set(
    events
      .filter(
        (event) =>
          event.name === eventName && event.category === category && event.type === type
      )
      .map((event) => event.sex)
  );
  if (sexes.has("OTHER")) return "MIXED_ONLY";
  if (sexes.has("MALE") && sexes.has("FEMALE")) return "BOTH";
  if (sexes.has("MALE")) return "MALE_ONLY";
  if (sexes.has("FEMALE")) return "FEMALE_ONLY";
  return "BOTH";
}
