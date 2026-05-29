import type { PrismaClient, ResultRound } from "@prisma/client";
import type { HeatSetting, StartListRoundTab } from "@/lib/startListSettings";
import { resolveRoundTabsForEvent } from "@/lib/startListSettings";
import { snapshotRoundForTab } from "@/lib/startListEventTabDisplay";

export function roundTabSplitFingerprint(tab: StartListRoundTab | undefined): string {
  if (!tab) return "null";
  return JSON.stringify({
    mode: tab.mode,
    heatCount: String(tab.heatCount ?? "").trim(),
    heatSize: String(tab.heatSize ?? "").trim(),
    maxLanesPerHeat: tab.maxLanesPerHeat ?? null,
  });
}

export function marshalRoundLabelJa(round: ResultRound): string {
  switch (round) {
    case "HEAT":
      return "予選（HEAT）";
    case "SEMI":
      return "準決勝（SEMI）";
    case "FINAL":
      return "決勝（FINAL）";
    default:
      return round;
  }
}

export function isMarshalRoundLocked(
  lockedRounds: readonly ResultRound[] | undefined,
  tabIndex: number,
  roundCount: number
): boolean {
  if (!lockedRounds?.length) return false;
  const round = snapshotRoundForTab(tabIndex, roundCount);
  return round != null && lockedRounds.includes(round);
}

export type MarshalCallClosedRoundsByEventId = Map<string, Set<ResultRound>>;

/** マーシャル締切（callClosedAt）済みヒートがあるラウンドを種目ごとに返す */
export async function getMarshalActiveRoundsForEvents(
  prisma: Pick<PrismaClient, "competitionHeatMarshalState">,
  competitionId: string,
  eventIds: readonly string[]
): Promise<MarshalCallClosedRoundsByEventId> {
  const out = new Map<string, Set<ResultRound>>();
  const uniqueIds = [...new Set(eventIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) return out;

  for (const id of uniqueIds) {
    out.set(id, new Set());
  }

  const marshalRows = await prisma.competitionHeatMarshalState.findMany({
    where: {
      competitionId,
      eventId: { in: uniqueIds },
      callClosedAt: { not: null },
    },
    select: { eventId: true, round: true },
  });

  for (const row of marshalRows) {
    out.get(row.eventId)?.add(row.round);
  }

  return out;
}

export function eventHasMarshalCallClosedRound(
  lockedMap: MarshalCallClosedRoundsByEventId,
  eventId: string
): boolean {
  return (lockedMap.get(eventId)?.size ?? 0) > 0;
}

export function eventHeatRoundMarshalCallClosed(
  lockedMap: MarshalCallClosedRoundsByEventId,
  eventId: string
): boolean {
  return lockedMap.get(eventId)?.has("HEAT") ?? false;
}

export function findLockedTabSettingViolation(params: {
  previousSetting: HeatSetting | undefined;
  nextSetting: HeatSetting | undefined;
  previousRoundCount: number;
  nextRoundCount: number;
  lockedRounds: Set<ResultRound>;
}): string | null {
  const { previousSetting, nextSetting, previousRoundCount, nextRoundCount, lockedRounds } =
    params;

  if (lockedRounds.size > 0 && previousRoundCount !== nextRoundCount) {
    return "マーシャル締切済みのラウンドがあるため、スタートリストのラウンド数を変更できません";
  }

  const prevTabs = resolveRoundTabsForEvent({
    heatSetting: previousSetting,
    roundCount: previousRoundCount,
  });
  const nextTabs = resolveRoundTabsForEvent({
    heatSetting: nextSetting,
    roundCount: nextRoundCount,
  });
  const tabCount = Math.max(prevTabs.length, nextTabs.length, nextRoundCount);

  for (let i = 0; i < tabCount; i += 1) {
    const prevTab = prevTabs[i];
    const nextTab = nextTabs[i];
    if (roundTabSplitFingerprint(prevTab) === roundTabSplitFingerprint(nextTab)) continue;

    const round = snapshotRoundForTab(i, nextRoundCount);
    if (!round) continue;
    if (lockedRounds.has(round)) {
      return `${marshalRoundLabelJa(round)}はマーシャル締切済みのため、ヒート分割・最大レーンを変更できません`;
    }
  }

  return null;
}

export type MarshalActiveRoundSettingsChange = {
  eventId: string;
  previousSetting: HeatSetting | undefined;
  nextSetting: HeatSetting | undefined;
  previousRoundCount: number;
  nextRoundCount: number;
};

export async function assertHeatSettingsUnchangedForMarshalActiveRounds(params: {
  prisma: PrismaClient;
  competitionId: string;
  changes: readonly MarshalActiveRoundSettingsChange[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const eventIds = params.changes.map((c) => c.eventId);
  const activeMap = await getMarshalActiveRoundsForEvents(
    params.prisma,
    params.competitionId,
    eventIds
  );

  for (const change of params.changes) {
    const locked = activeMap.get(change.eventId);
    if (!locked || locked.size === 0) continue;

    const message = findLockedTabSettingViolation({
      previousSetting: change.previousSetting,
      nextSetting: change.nextSetting,
      previousRoundCount: change.previousRoundCount,
      nextRoundCount: change.nextRoundCount,
      lockedRounds: locked,
    });
    if (message) {
      return { ok: false, message };
    }
  }

  return { ok: true };
}
