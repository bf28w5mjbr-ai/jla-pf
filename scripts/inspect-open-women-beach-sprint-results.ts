import { prisma } from "@/server/db";
import { loadPublicHeatResultOverlaysForEvent } from "@/lib/startListPublicHeatResults";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0009jr044y4c7616";

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: {
      id: true,
      name: true,
      sex: true,
      ageCategory: { select: { name: true } },
      startListRoundCount: true,
    },
  });
  console.log("event:", event);

  const official = await prisma.officialResult.findMany({
    where: { competitionId: COMPETITION_ID, eventId: EVENT_ID },
    include: {
      heatConfirmations: { orderBy: { heat: "asc" } },
      rows: {
        orderBy: [{ heat: "asc" }, { rank: "asc" }],
        include: {
          competitionEntry: {
            select: {
              user: { select: { profile: { select: { familyName: true, givenName: true } } } },
            },
          },
        },
      },
    },
    orderBy: { round: "asc" },
  });

  for (const r of official) {
    console.log(`\n=== round ${r.round} published=${r.publishedAt} locked=${r.lockedAt} ===`);
    console.log("confirmed heats:", r.heatConfirmations.map((h) => h.heat).join(", ") || "—");
    const byHeat = new Map<number, typeof r.rows>();
    for (const row of r.rows) {
      const h = row.heat ?? 0;
      if (!byHeat.has(h)) byHeat.set(h, []);
      byHeat.get(h)!.push(row);
    }
    for (const [h, rows] of [...byHeat.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(` heat ${h} (${rows.length} rows)`);
      for (const row of rows) {
        const p = row.competitionEntry?.user.profile;
        console.log(
          `   rank=${row.rank ?? "—"} lane=${row.lane ?? "—"} status=${row.status} ${p?.familyName ?? ""} ${p?.givenName ?? ""} entry=${row.competitionEntryId}`
        );
      }
    }
  }

  const overlay = await loadPublicHeatResultOverlaysForEvent(COMPETITION_ID, EVENT_ID);
  console.log("\npublic overlay:");
  for (const o of overlay) {
    console.log(` round ${o.round} finalized=${o.isFinalized} confirmedHeats=${o.confirmedHeatIndices.join(",")}`);
    for (const [key, row] of Object.entries(o.rowsByKey)) {
      console.log(`   ${key} → rank=${row.rank} status=${row.status}`);
    }
  }

  // validation: duplicate ranks per heat, rank gaps, entry not in snapshot heat
  const heatRound = official.find((r) => r.round === "HEAT");
  if (heatRound) {
    console.log("\n=== validation HEAT ===");
    const confirmed = new Set(heatRound.heatConfirmations.map((h) => h.heat));
    for (const heat of confirmed) {
      const rows = heatRound.rows.filter((r) => r.heat === heat && r.status === "OK" && r.rank != null);
      const ranks = rows.map((r) => r.rank!);
      const dup = ranks.filter((r, i) => ranks.indexOf(r) !== i);
      if (dup.length) console.log(` heat ${heat}: DUPLICATE ranks`, dup);
      const sorted = [...ranks].sort((a, b) => a - b);
      if (sorted.length && (sorted[0] !== 1 || sorted[sorted.length - 1] !== sorted.length)) {
        console.log(` heat ${heat}: rank sequence issue`, sorted);
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
