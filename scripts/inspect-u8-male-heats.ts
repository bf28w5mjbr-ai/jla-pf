import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnumsc280009kv04nfcp48o4";

async function main() {
  const snap = await loadStartListSnapshotPayload(COMPETITION_ID);
  const round = getRoundDataFromSnapshot(snap, EVENT_ID, "HEAT");
  for (const h of round?.heats ?? []) {
    console.log("heat", h.heatIndex);
    h.participants?.forEach((p, i) => {
      if (p.kind === "INDIVIDUAL") console.log(`  lane ${i + 1}: ${p.name} (${p.entryId})`);
    });
  }
}

main().finally(() => prisma.$disconnect());
