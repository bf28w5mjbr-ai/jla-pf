import { prisma } from "@/server/db";
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { listMarshalRoundsInSnapshotForEvent } from "@/lib/heatMarshalFromSnapshot";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const events = await prisma.event.findMany({
    where: { competitionId: COMPETITION_ID, name: { contains: "ボード" } },
    select: { id: true, name: true, sex: true },
  });
  console.log("board events:", events);

  const snap = await loadStartListSnapshotPayload(COMPETITION_ID);

  for (const ev of events) {
    console.log("\n===", ev.name, ev.sex, ev.id, "===");
    console.log("rounds:", listMarshalRoundsInSnapshotForEvent(snap, ev.id));
    const semi = getRoundDataFromSnapshot(snap, ev.id, "SEMI");
    if (!semi) {
      console.log("no SEMI in snapshot");
    } else {
      for (const h of semi.heats) {
        console.log("heat", h.heatIndex, "n=", h.participants.length);
        h.participants.forEach((p, i) => {
          if (p.kind === "INDIVIDUAL") console.log(`  L${i + 1}`, p.name);
        });
      }
    }

    const official = await prisma.officialResult.findUnique({
      where: {
        competitionId_eventId_round: {
          competitionId: COMPETITION_ID,
          eventId: ev.id,
          round: "SEMI",
        },
      },
      select: {
        id: true,
        lockedAt: true,
        rows: { orderBy: [{ heat: "asc" }, { rank: "asc" }] },
        heatConfirmations: { select: { heat: true } },
      },
    });
    if (!official) {
      console.log("no official SEMI");
      continue;
    }
    console.log("official id", official.id, "locked", official.lockedAt);
    console.log("heat confirms", official.heatConfirmations.map((c) => c.heat));
    for (const row of official.rows) {
      const entry = row.competitionEntryId
        ? await prisma.competitionEntry.findUnique({
            where: { id: row.competitionEntryId },
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          })
        : null;
      const n = entry?.user.profile
        ? `${entry.user.profile.familyName} ${entry.user.profile.givenName}`
        : "?";
      console.log(`  h${row.heat} rank${row.rank} lane${row.lane} ${n}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
