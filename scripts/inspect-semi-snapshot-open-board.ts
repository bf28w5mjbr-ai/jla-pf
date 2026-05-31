import { prisma } from "@/server/db";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { listMarshalRoundsInSnapshotForEvent } from "@/lib/heatMarshalFromSnapshot";
import { parseStartListSnapshotLooseForRoundRead } from "@/lib/heatMarshalFromSnapshot";

const cid = "cmnugqbxx000gjs04y449vpnv";
const eid = "cmnwtnhxi0005jr04atytm9jr";

const snap = await prisma.competitionStartListSnapshot.findUnique({
  where: { competitionId: cid },
  select: { data: true, capturedAt: true },
});

const payload = parseStartListSnapshotLooseForRoundRead(snap?.data);
console.log("availableRounds", listMarshalRoundsInSnapshotForEvent(payload, eid));
console.log("capturedAt", snap?.capturedAt?.toISOString());

const frozen = extractFrozenRoundsForEventFromSnapshotData(snap?.data, eid);
for (const r of frozen ?? []) {
  console.log("\n", r.round, r.generatedBy, "heats:", r.heats.length);
  for (const h of r.heats) {
    const names = h.participants.slice(0, 3).map((p) =>
      p.kind === "INDIVIDUAL" ? p.name : p.teamName
    );
    console.log("  heat", h.heatIndex, "n=", h.participants.length, names.join(", "));
  }
}

const ev = await prisma.event.findUnique({
  where: { id: eid },
  select: { name: true, type: true, startListRoundCount: true, preliminaryHeatLaneCount: true },
});
console.log("\nevent", ev);

await prisma.$disconnect();
