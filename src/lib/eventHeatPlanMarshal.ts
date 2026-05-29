import { prisma } from "@/server/db";
import type { HeatSetting } from "@/lib/startListSettings";
import { normalizeRoundTabs } from "@/lib/startListSettings";

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
      maxLanesPerHeat: t.maxLanesPerHeat ?? null,
      auto: false,
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
