import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";

const EVENT_ID = "cmnwtnhxi0006jr04j659gw76";

async function main() {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: "cmnugqbxx000gjs04y449vpnv",
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId: EVENT_ID } },
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
