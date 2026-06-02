import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const eventId = "cmnuyd66z0004l4046fejqkdn";
const compId = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, sex: true, type: true },
  });
  console.log("event:", event);

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: compId,
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId } },
    },
    select: {
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
      club: { select: { name: true } },
    },
  });
  console.log("entries:", entries.length);
  for (const e of entries.sort((a, b) =>
    (a.user.profile?.familyName ?? "").localeCompare(b.user.profile?.familyName ?? "")
  )) {
    console.log(
      `${e.user.profile?.familyName} ${e.user.profile?.givenName} | ${e.club?.name ?? ""}`
    );
  }

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: compId },
    select: { data: true },
  });
  const rounds = extractFrozenRoundsForEventFromSnapshotData(snap?.data, eventId);
  console.log("\nrounds:", rounds?.map((r) => `${r.round}(${r.heats.length})`).join(", "));
}

main()
  .finally(() => prisma.$disconnect());
