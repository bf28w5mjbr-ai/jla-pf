import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import type { HeatSetting } from "@/lib/startListSettings";
import { normalizeRoundTabs, parseStartListSettings } from "@/lib/startListSettings";

const EMPTY_HEAT: HeatSetting = { mode: "count", heatCount: "1", heatSize: "" };

/** マーシャル後も変更不可にする分割設定の比較用フィンガープリント（ラベル・タブ id は含めない） */
export function heatPlanSplitFingerprint(setting: HeatSetting | undefined): string {
  if (!setting) return "null";
  const tabs = normalizeRoundTabs(setting);
  return JSON.stringify(
    tabs.map((t) => ({
      mode: t.mode,
      heatCount: String(t.heatCount ?? "").trim(),
      heatSize: String(t.heatSize ?? "").trim(),
      auto: t.useAutoHeatFromMaxLanes !== false,
    }))
  );
}

export function mergeEventSettingsForMarshalCompare(params: {
  eventIds: readonly string[];
  previous: Record<string, HeatSetting>;
  proposed: Record<string, HeatSetting>;
}): Record<string, HeatSetting> {
  const out: Record<string, HeatSetting> = {};
  for (const id of params.eventIds) {
    out[id] = params.proposed[id] ?? params.previous[id] ?? EMPTY_HEAT;
  }
  return out;
}

export async function assertHeatSettingsUnchangedForMarshalLockedEvents(params: {
  prisma: PrismaClient;
  competitionId: string;
  previousEnvelope: ReturnType<typeof parseStartListSettings>;
  nextEventSettings: Record<string, HeatSetting>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const locked = await params.prisma.event.findMany({
    where: { competitionId: params.competitionId, marshalStartedAt: { not: null } },
    select: { id: true },
  });
  for (const { id } of locked) {
    const prev = params.previousEnvelope.eventSettings[id] ?? EMPTY_HEAT;
    const next = params.nextEventSettings[id] ?? EMPTY_HEAT;
    if (heatPlanSplitFingerprint(prev) !== heatPlanSplitFingerprint(next)) {
      return {
        ok: false,
        message: "マーシャル開始後はラウンド別ヒートの分割設定を変更できません",
      };
    }
  }
  return { ok: true };
}

type EventDelegate = typeof prisma.event;

export async function markMarshalStartedIfUnset(
  eventDelegate: EventDelegate,
  eventId: string,
  at: Date = new Date()
): Promise<void> {
  await eventDelegate.updateMany({
    where: { id: eventId, marshalStartedAt: null },
    data: { marshalStartedAt: at },
  });
}
