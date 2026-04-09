type StartListSettingsWithDayOps = {
  /** 本人棄権など種目単位の補助フラグ。マーシャル可否は CompetitionHeatMarshalState（ラウンド×ヒート）で管理する */
  dayOpsCallClosedEventIds?: unknown;
};

export function getClosedCallEventIds(settings: unknown): Set<string> {
  if (!settings || typeof settings !== "object") return new Set();
  const raw = (settings as StartListSettingsWithDayOps).dayOpsCallClosedEventIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

export function isCallClosedForEvent(settings: unknown, eventId: string): boolean {
  return getClosedCallEventIds(settings).has(eventId);
}

export function buildCallWindowSettingsUpdate(params: {
  currentSettings: unknown;
  eventId: string;
  isClosed: boolean;
}) {
  const base =
    params.currentSettings && typeof params.currentSettings === "object"
      ? (params.currentSettings as Record<string, unknown>)
      : {};
  const nextIds = getClosedCallEventIds(base);

  if (params.isClosed) {
    nextIds.add(params.eventId);
  } else {
    nextIds.delete(params.eventId);
  }

  return {
    ...base,
    dayOpsCallClosedEventIds: Array.from(nextIds),
  };
}
