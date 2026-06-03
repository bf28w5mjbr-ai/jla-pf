/**
 * 直近の管理者一斉通知（ADMIN_BROADCAST）を削除する。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/delete-recent-broadcast-notifications.ts
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/delete-recent-broadcast-notifications.ts --minutes=30
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/delete-recent-broadcast-notifications.ts --job-id=<id>
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/delete-recent-broadcast-notifications.ts --dry-run
 */
import { prisma } from "../src/server/db";

const dryRun = process.argv.includes("--dry-run");
const jobIdArg = process.argv.find((a) => a.startsWith("--job-id="))?.slice("--job-id=".length);
const minutesArg = process.argv.find((a) => a.startsWith("--minutes="))?.slice("--minutes=".length);
const minutes = minutesArg ? Number(minutesArg) : 30;

async function main() {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.error("Invalid --minutes");
    process.exit(1);
  }

  const since = new Date(Date.now() - minutes * 60 * 1000);

  let jobIds: string[];
  if (jobIdArg) {
    jobIds = [jobIdArg];
  } else {
    const jobs = await prisma.notificationJob.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true, payload: true, totalCount: true },
      orderBy: { createdAt: "desc" },
    });
    console.log(
      `notification jobs since ${since.toISOString()}:`,
      jobs.map((j) => ({
        id: j.id,
        createdAt: j.createdAt.toISOString(),
        title: (j.payload as { title?: string } | null)?.title,
        totalCount: j.totalCount,
      }))
    );
    jobIds = jobs.map((j) => j.id);
  }

  if (jobIds.length === 0) {
    console.log("対象ジョブがありません");
    return;
  }

  const where = {
    type: "ADMIN_BROADCAST",
    relatedId: { in: jobIds },
  };

  const count = await prisma.notification.count({ where });
  console.log("notifications to delete:", count, "jobIds:", jobIds);

  if (dryRun) {
    console.log("[dry-run] skipped delete");
    return;
  }

  const deleted = await prisma.notification.deleteMany({ where });
  console.log("deleted notifications:", deleted.count);

  if (!jobIdArg) {
    const deletedJobs = await prisma.notificationJob.deleteMany({
      where: { id: { in: jobIds } },
    });
    console.log("deleted notification jobs:", deletedJobs.count);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
