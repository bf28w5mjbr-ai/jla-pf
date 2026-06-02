import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

async function main() {
  const event = await prisma.event.findFirst({
    where: {
      competitionId: COMPETITION_ID,
      sex: "FEMALE",
      name: { contains: "ビーチフラッグ" },
      ageCategory: { name: { contains: "オープン" } },
    },
    select: { id: true, name: true, ageCategory: { select: { name: true } } },
  });
  if (!event) {
    console.error("event not found");
    process.exit(1);
  }
  console.log("event:", event.id, event.name, event.ageCategory?.name);

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: COMPETITION_ID,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId: event.id } },
    },
    select: {
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
      club: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const e of entries) {
    const p = e.user.profile;
    console.log(`${p?.familyName} ${p?.givenName} | ${e.club?.name}`);
  }
  console.log("total", entries.length);
}

main().finally(() => prisma.$disconnect());
