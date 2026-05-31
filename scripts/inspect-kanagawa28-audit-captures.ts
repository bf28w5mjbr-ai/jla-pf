import { prisma } from "@/server/db";

async function main() {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "COMPETITION_START_LIST_SNAPSHOT_CAPTURE",
      createdAt: {
        gte: new Date("2026-05-30T22:00:00Z"),
      },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, meta: true },
  });
  for (const r of rows) {
    console.log(r.createdAt.toISOString(), JSON.stringify(r.meta));
  }
}

main().finally(() => prisma.$disconnect());
