/**
 * 神奈川28: 5/31 開催種目とスナップショット概要
 */
import { dayKeyFromInstant } from "@/lib/competitionScheduleDays";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const TARGET_DAY = "2026-05-31";
const RESTORE_BEFORE = new Date("2026-05-30T09:00:00.000Z"); // 5/30 18:00 JST

async function main() {
  const comp = await prisma.competition.findUnique({
    where: { id: COMPETITION_ID },
    select: { name: true, startDate: true, endDate: true, startListSettings: true },
  });
  console.log("competition:", comp?.name);
  console.log("restore target before:", RESTORE_BEFORE.toISOString(), "(5/30 18:00 JST)");

  const events = await prisma.event.findMany({
    where: { competitionId: COMPETITION_ID },
    select: {
      id: true,
      name: true,
      sex: true,
      type: true,
      scheduledStartAt: true,
      roundScheduledStarts: true,
      startListRoundCount: true,
      ageCategory: { select: { name: true } },
    },
    orderBy: [{ displayOrder: "asc" }],
  });

  const day531Ids = new Set<string>();
  for (const e of events) {
    if (dayKeyFromInstant(e.scheduledStartAt) === TARGET_DAY) day531Ids.add(e.id);
    const rs = e.roundScheduledStarts as Record<string, string> | null;
    if (rs) {
      for (const v of Object.values(rs)) {
        if (dayKeyFromInstant(v) === TARGET_DAY) day531Ids.add(e.id);
      }
    }
  }

  console.log(`\n=== ${TARGET_DAY} events: ${day531Ids.size}`);
  for (const e of events.filter((ev) => day531Ids.has(ev.id))) {
    console.log(
      `- ${e.id} ${e.sex} ${e.ageCategory?.name ?? "?"} ${e.name} rounds=${e.startListRoundCount}`
    );
  }

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { capturedAt: true, data: true },
  });
  console.log("\nsnapshot capturedAt:", snap?.capturedAt?.toISOString());

  if (snap?.data) {
    for (const e of events.filter((ev) => day531Ids.has(ev.id))) {
      const rounds = extractFrozenRoundsForEventFromSnapshotData(snap.data, e.id);
      const roundSummary = (rounds ?? []).map((r) => {
        const heatCounts = r.heats.map((h) => h.participants.length).join("+");
        return `${r.round}(${r.heats.length}h:${heatCounts})@${r.generatedAt ?? "?"}`;
      });
      console.log(`  ${e.name}: ${roundSummary.join(" | ")}`);
    }
  }

  const audits = await prisma.auditLog.findMany({
    where: {
      action: { contains: "START_LIST" },
      target: { contains: COMPETITION_ID },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { action: true, createdAt: true, meta: true },
  });
  console.log(`\n=== recent start-list audits (${audits.length})`);
  for (const a of audits) {
    const meta = a.meta as Record<string, unknown> | null;
    console.log(a.createdAt.toISOString(), a.action, JSON.stringify(meta ?? {}).slice(0, 200));
  }

  const around = await prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: new Date("2026-05-30T08:00:00.000Z"),
        lte: new Date("2026-05-30T10:00:00.000Z"),
      },
      OR: [
        { target: { contains: COMPETITION_ID } },
        { meta: { path: ["competitionId"], equals: COMPETITION_ID } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true, meta: true },
  });
  console.log(`\n=== audits around 5/30 18:00 JST (${around.length})`);
  for (const a of around) {
    console.log(a.createdAt.toISOString(), a.action);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
