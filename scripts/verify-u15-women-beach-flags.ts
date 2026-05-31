import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const EVENT_ID = "cmnv8gubn0007l404mgv689tj";
const COMP = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMP },
    select: { data: true },
  });
  const heat = extractFrozenRoundsForEventFromSnapshotData(snap!.data, EVENT_ID)?.find(
    (r) => r.round === "HEAT"
  );
  for (const h of heat?.heats ?? []) {
    console.log(`\nheat ${h.heatIndex}`);
    h.participants.forEach((p, i) => {
      if (p.kind === "INDIVIDUAL") console.log(`  lane ${i + 1}: ${p.name}`);
    });
  }
}

main().finally(() => prisma.$disconnect());
