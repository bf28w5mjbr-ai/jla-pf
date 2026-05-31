import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const NAMES = ["秋本 幹太", "高須 快晴", "相澤 虎大", "浜地 櫂依"];

async function main() {
  for (const full of NAMES) {
    const [familyName, givenName] = full.split(" ");
    const entries = await prisma.competitionEntry.findMany({
      where: {
        competitionId: COMPETITION_ID,
        user: {
          profile: {
            familyName: { contains: familyName.slice(0, 2) },
            givenName: { contains: givenName.slice(0, 1) },
          },
        },
      },
      select: {
        id: true,
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
        items: { select: { event: { select: { id: true, name: true, sex: true } } } },
      },
      take: 5,
    });
    console.log("\n", full, "entries:", entries.length);
    for (const e of entries) {
      const p = e.user.profile;
      for (const item of e.items) {
        console.log(
          `  ${p?.familyName} ${p?.givenName} event=${item.event?.name} ${item.event?.sex} ${item.event?.id}`
        );
      }
      const rows = await prisma.officialResultRow.findMany({
        where: { competitionEntryId: e.id },
        include: { officialResult: { select: { round: true, eventId: true } } },
      });
      for (const r of rows) {
        console.log(
          `    official ${r.officialResult.round} h${r.heat} rank${r.rank} lane${r.lane}`
        );
      }
    }
  }

  const semiResults = await prisma.officialResult.findMany({
    where: { competitionId: COMPETITION_ID, round: "SEMI" },
    select: {
      eventId: true,
      event: { select: { name: true, sex: true } },
      rows: { take: 3 },
    },
  });
  console.log("\nAll SEMI official results in competition:", semiResults.length);
  for (const s of semiResults) {
    console.log(`  ${s.event?.name} ${s.event?.sex} ${s.eventId} rows=${s.rows.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
