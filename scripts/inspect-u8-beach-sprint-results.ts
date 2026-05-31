import { prisma } from "@/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "神奈川県ライフセービング";

async function main() {
  const comp = await prisma.competition.findFirst({
    where: { OR: [{ name: COMPETITION_NAME }, { name: { contains: NAME_FALLBACK } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  if (!comp) {
    console.error("competition not found");
    process.exit(1);
  }
  console.log("competition:", comp.id, comp.name);

  const events = await prisma.event.findMany({
    where: {
      competitionId: comp.id,
      name: { contains: "ビーチスプリント" },
    },
    select: {
      id: true,
      name: true,
      sex: true,
      ageCategory: { select: { name: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  });
  console.log(
    "beach sprint events:",
    events.map((e) => ({ id: e.id, name: e.name, age: e.ageCategory?.name, sex: e.sex }))
  );

  for (const ev of events) {
    const results = await prisma.officialResult.findMany({
      where: { competitionId: comp.id, eventId: ev.id },
      include: {
        rows: {
          include: {
            competitionEntry: {
              select: {
                user: {
                  select: { profile: { select: { familyName: true, givenName: true } } },
                },
              },
            },
          },
          orderBy: [{ heat: "asc" }, { rank: "asc" }],
        },
        heatConfirmations: { orderBy: { heat: "asc" } },
      },
    });
    if (results.length === 0) continue;

    console.log(`\n=== ${ev.name} (${ev.ageCategory?.name ?? "—"}) ${ev.id} ===`);
    for (const r of results) {
      console.log(
        `round ${r.round} published=${r.publishedAt?.toISOString() ?? "null"} locked=${r.lockedAt?.toISOString() ?? "null"} officialResultId=${r.id}`
      );
      console.log("confirmed heats:", r.heatConfirmations.map((h) => h.heat).join(", ") || "—");
      for (const row of r.rows) {
        const p = row.competitionEntry?.user.profile;
        const name = p ? `${p.familyName} ${p.givenName}` : "—";
        if (
          row.heat === 1 ||
          row.heat === 2 ||
          row.rank === 2 ||
          row.rank === 7 ||
          name.includes("栗飯原") ||
          name.includes("マイヤー")
        ) {
          console.log(
            `  heat=${row.heat} lane=${row.lane} rank=${row.rank} status=${row.status} entry=${row.competitionEntryId} name=${name} rowId=${row.id}`
          );
        }
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
