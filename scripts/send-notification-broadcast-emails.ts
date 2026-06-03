/**
 * 既に作成済みの一斉通知（ADMIN_BROADCAST）に対し、メールのみ送信する。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/send-notification-broadcast-emails.ts --job-id=<id>
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/send-notification-broadcast-emails.ts --job-id=<id> --dry-run
 */
import { prisma } from "../src/server/db";
import { runBroadcastEmailDispatch } from "../src/lib/notificationService";

const dryRun = process.argv.includes("--dry-run");
const jobIdArg = process.argv.find((a) => a.startsWith("--job-id="))?.slice("--job-id=".length);

async function main() {
  if (!jobIdArg) {
    console.error("Specify --job-id=<notificationJobId>");
    process.exit(1);
  }

  const sample = await prisma.notification.findFirst({
    where: {
      relatedId: jobIdArg,
      type: "ADMIN_BROADCAST",
    },
    select: { title: true, body: true, linkUrl: true },
  });
  if (!sample) {
    console.error("ADMIN_BROADCAST 通知が見つかりません:", jobIdArg);
    process.exit(1);
  }

  const rows = await prisma.notification.findMany({
    where: {
      relatedId: jobIdArg,
      type: "ADMIN_BROADCAST",
    },
    select: { userId: true },
  });
  const userIds = rows.map((r) => r.userId);

  console.log("job:", jobIdArg);
  console.log("title:", sample.title);
  console.log("recipients:", userIds.length);

  if (dryRun) {
    console.log("[dry-run] would send emails to", userIds.length, "users");
    return;
  }

  const result = await runBroadcastEmailDispatch(userIds, {
    title: sample.title,
    body: sample.body,
    linkUrl: sample.linkUrl ?? undefined,
  });

  console.log("email dispatch done:", result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
