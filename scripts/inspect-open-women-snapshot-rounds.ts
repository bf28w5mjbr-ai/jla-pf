import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

async function main() {
  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { capturedAt: true, updatedAt: true, data: true },
  });
  console.log("snapshot capturedAt:", snap?.capturedAt?.toISOString());
  console.log("snapshot updatedAt:", snap?.updatedAt?.toISOString());

  const confirms = await prisma.officialResultHeatConfirmed.findMany({
    where: {
      officialResult: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        round: "HEAT",
      },
    },
    orderBy: { confirmedAt: "asc" },
    select: { heat: true, confirmedAt: true },
  });
  console.log("heat confirms:", confirms);

  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap?.data, EVENT_ID);
  console.log(
    "frozen rounds:",
    rounds?.map((r) => ({
      round: r.round,
      generatedAt: r.generatedAt,
      generatedBy: r.generatedBy,
      heats: r.heats.length,
      participants: r.heats.reduce((n, h) => n + h.participants.length, 0),
    }))
  );
}

main().finally(() => prisma.$disconnect());
