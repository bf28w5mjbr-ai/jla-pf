import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { name: true, sex: true, ageCategory: { select: { name: true } } },
  });
  console.log("event:", event);

  const snap = await loadStartListSnapshotPayload(COMPETITION_ID);
  const round = getRoundDataFromSnapshot(snap, EVENT_ID, "HEAT");
  if (!round) {
    console.log("no HEAT in snapshot");
    return;
  }
  for (const h of round.heats) {
    console.log(`\nheat ${h.heatIndex} (${h.participants.length} participants)`);
    h.participants.forEach((p, i) => {
      if (p.kind === "INDIVIDUAL") {
        console.log(`  lane ${i + 1}: ${p.name} (${p.entryId})`);
      }
    });
  }
}

main().finally(() => prisma.$disconnect());
