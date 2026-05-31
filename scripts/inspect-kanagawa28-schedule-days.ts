/**
 * 神奈川28: 全種目のスケジュール日とスナップショット HEAT generatedAt
 */
import { dayKeyFromInstant } from "@/lib/competitionScheduleDays";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { loadScheduleRowPartitionForCompetition } from "@/lib/scheduleRowOrderServer";
import { parseScheduleRowKey } from "@/lib/scheduleRowOrder";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const { partitionByDay, competitionDayKeys } =
    await loadScheduleRowPartitionForCompetition(COMPETITION_ID);
  console.log("competition days:", competitionDayKeys);

  const events = await prisma.event.findMany({
    where: { competitionId: COMPETITION_ID },
    select: {
      id: true,
      name: true,
      sex: true,
      scheduledStartAt: true,
      ageCategory: { select: { name: true } },
    },
    orderBy: [{ displayOrder: "asc" }],
  });
  const byId = new Map(events.map((e) => [e.id, e]));

  for (const dayKey of competitionDayKeys) {
    const part = partitionByDay[dayKey];
    if (!part) continue;
    const ids = new Set<string>();
    for (const keys of Object.values(part)) {
      for (const key of keys) {
        const parsed = parseScheduleRowKey(key);
        if (parsed) ids.add(parsed.eventId);
      }
    }
    console.log(`\n=== ${dayKey}: ${ids.size} events`);
    for (const id of [...ids].sort()) {
      const e = byId.get(id);
      if (!e) continue;
      console.log(
        `  ${e.sex} ${e.ageCategory?.name ?? "?"} ${e.name} start=${dayKeyFromInstant(e.scheduledStartAt)}`
      );
    }
  }

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { capturedAt: true, data: true },
  });
  console.log("\nsnapshot capturedAt:", snap?.capturedAt?.toISOString());

  const day531 = partitionByDay["2026-05-31"];
  const day531Ids = new Set<string>();
  if (day531) {
    for (const keys of Object.values(day531)) {
      for (const key of keys) {
        const parsed = parseScheduleRowKey(key);
        if (parsed) day531Ids.add(parsed.eventId);
      }
    }
  }

  console.log(`\n=== 5/31 snapshot HEAT rounds (${day531Ids.size} events)`);
  for (const id of [...day531Ids]) {
    const e = byId.get(id);
    const rounds = snap?.data
      ? extractFrozenRoundsForEventFromSnapshotData(snap.data, id)
      : null;
    const heat = rounds?.find((r) => r.round === "HEAT");
    const heatInfo = heat
      ? `${heat.heats.length} heats, generatedAt=${heat.generatedAt}, by=${heat.generatedBy}`
      : "no HEAT";
    console.log(`  ${e?.name}: ${heatInfo}`);
  }

  const confirmed = await prisma.event.findMany({
    where: { id: { in: [...day531Ids] } },
    select: { name: true, startListHeatPlanConfirmedAt: true },
    orderBy: { displayOrder: "asc" },
  });
  console.log("\n=== confirmedAt distribution");
  const buckets = new Map<string, number>();
  for (const e of confirmed) {
    const k = e.startListHeatPlanConfirmedAt?.toISOString() ?? "null";
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  for (const [k, n] of buckets) console.log(n, k);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
