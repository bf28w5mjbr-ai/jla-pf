import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { loadScheduleRowPartitionForCompetition } from "@/lib/scheduleRowOrderServer";
import { parseScheduleRowKey } from "@/lib/scheduleRowOrder";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const { partitionByDay } = await loadScheduleRowPartitionForCompetition(COMPETITION_ID);
  const firstKey = Object.values(partitionByDay["2026-05-31"] ?? {}).flat()[0];
  const eventId = parseScheduleRowKey(firstKey!)?.eventId;
  console.log("sample eventId", eventId);

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { capturedAt: true, data: true },
  });
  console.log("capturedAt", snap?.capturedAt.toISOString());

  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap!.data, eventId!);
  const heat = rounds?.find((r) => r.round === "HEAT");
  console.log("heat generatedAt", heat?.generatedAt);
  console.log(
    "heat1 lanes",
    heat?.heats[0]?.participants.map((p, i) => `${i + 1}:${p.kind === "INDIVIDUAL" ? p.name : p.teamName}`)
  );
}

main().finally(() => prisma.$disconnect());
