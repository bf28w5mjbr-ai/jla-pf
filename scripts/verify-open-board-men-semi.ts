import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0004jr04my5mzm2t";

async function main() {
  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        round: "SEMI",
      },
    },
    include: {
      rows: { orderBy: [{ heat: "asc" }, { lane: "asc" }] },
      heatConfirmations: true,
    },
  });
  if (!official) {
    console.error("no SEMI official");
    process.exit(1);
  }
  console.log("rows", official.rows.length, "confirmed heats", official.heatConfirmations.map((c) => c.heat));
  for (const row of official.rows) {
    const e = row.competitionEntryId
      ? await prisma.competitionEntry.findUnique({
          where: { id: row.competitionEntryId },
          select: {
            user: { select: { profile: { select: { familyName: true, givenName: true } } } },
          },
        })
      : null;
    const n = e?.user.profile
      ? `${e.user.profile.familyName} ${e.user.profile.givenName}`
      : "?";
    console.log(`H${row.heat} L${row.lane} rank${row.rank} ${n}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
