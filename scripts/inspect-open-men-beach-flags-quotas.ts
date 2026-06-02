import {
  computeLiveAdvanceQuotasForFrozenNonFinalTab,
  extractFrozenRoundsForEventFromSnapshotData,
} from "@/lib/startListEventTabDisplay";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
} from "@/lib/startListSettings";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const event = await prisma.event.findFirst({
    where: {
      competitionId: COMPETITION_ID,
      sex: "MALE",
      name: { contains: "オープンビーチフラッグ" },
    },
    select: {
      id: true,
      name: true,
      preliminaryHeatLaneCount: true,
      startListHeatPlanConfirmedAt: true,
    },
  });
  if (!event) {
    console.error("event not found");
    process.exit(1);
  }
  console.log("event:", event.id, event.name);

  const comp = await prisma.competition.findUnique({
    where: { id: COMPETITION_ID },
    select: { startListSettings: true },
  });
  const { eventSettings } = parseStartListSettings(comp?.startListSettings ?? null);
  const roundTabs = normalizeRoundTabs(eventSettings[event.id] ?? {});
  console.log("raw eventSettings:", JSON.stringify(eventSettings[event.id], null, 2));
  console.log("tabs:", roundTabs.map((t) => `${t.label}(${t.mode} hc=${t.heatCount} hs=${t.heatSize} lanes=${t.maxLanesPerHeat ?? "-"})`).join(" | "));
  console.log("heatPlanStep1Confirmed:", event.startListHeatPlanConfirmedAt != null);
  console.log("preliminaryHeatLaneCount:", event.preliminaryHeatLaneCount);
  console.log("event heat setting:", JSON.stringify(primaryHeatSettingFromEventConfig(eventSettings[event.id])));

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  if (!snap?.data) {
    console.error("no snapshot");
    process.exit(1);
  }

  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap.data, event.id);
  const tabCount = roundTabs.length;
  for (const r of rounds ?? []) {
    const tabIndex = r.round === "HEAT" ? 0 : r.round === "SEMI" ? 1 : 2;
    const heatSizes = r.heats.map((h) => h.participants.length);
    const computed =
      tabIndex < tabCount - 1
        ? computeLiveAdvanceQuotasForFrozenNonFinalTab({
            snapshotRound: r.round,
            tabIndex,
            tabCount,
            heatSizes,
            totalParticipants: heatSizes.reduce((a, b) => a + b, 0),
            liveTabs: roundTabs,
            preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
            eventHeatSetting: eventSettings[event.id],
          })
        : null;
    console.log(`\nround ${r.round} (${roundTabs[tabIndex]?.label ?? "?"}), heats=${r.heats.length}`);
    console.log("  stored quotas:", JSON.stringify(r.advanceQuotasByOfficialHeat));
    console.log("  computed quotas:", JSON.stringify(computed));
    console.log("  heat sizes:", r.heats.map((h) => `${h.heatIndex}:${h.participants.length}`).join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
