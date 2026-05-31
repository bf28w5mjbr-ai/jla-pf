import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

async function main() {
  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap?.data, EVENT_ID);
  const semi = rounds?.find((r) => r.round === "SEMI");
  if (!semi) {
    console.log("no SEMI");
    return;
  }
  for (const h of semi.heats) {
    console.log(`Heat ${h.heatIndex} count ${h.participants.length}`);
    for (const p of h.participants) {
      if (p.kind !== "INDIVIDUAL") continue;
      console.log(`  ${p.name} srcHeat=${p.sourceHeat} rank=${p.sourceRank}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
