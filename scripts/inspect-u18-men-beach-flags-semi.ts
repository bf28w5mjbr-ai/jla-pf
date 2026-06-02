import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnuyd66z0006l404coecq0k4";

async function main() {
  const ev = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { name: true, sex: true },
  });
  console.log("event:", ev);

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap?.data, EVENT_ID);
  for (const r of rounds ?? []) {
    console.log("\n===", r.round, "===");
    for (const h of r.heats) {
      console.log("heat", h.heatIndex);
      h.participants.forEach((p, i) =>
        console.log(`  L${i + 1}`, p.kind === "INDIVIDUAL" ? p.name : p.teamName)
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
