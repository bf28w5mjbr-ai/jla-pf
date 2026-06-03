/**
 * 一斉通知ジョブの未配信分を再送する。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/resend-notification-broadcast-failures.ts --job-id=<id>
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/resend-notification-broadcast-failures.ts --job-id=<id> --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/resend-notification-broadcast-failures.ts --latest-failed
 */
import { prisma } from "../src/server/db";
import {
  type BroadcastRole,
  type BroadcastTarget,
  resolveBroadcastTargetUserIds,
} from "../src/lib/adminNotificationBroadcastTargets";
import { createBroadcastNotifications } from "../src/lib/notificationService";

const dryRun = process.argv.includes("--dry-run");
const jobIdArg = process.argv.find((a) => a.startsWith("--job-id="))?.slice("--job-id=".length);
const useLatestFailed = process.argv.includes("--latest-failed");

type JobPayload = {
  target?: BroadcastTarget;
  role?: BroadcastRole | null;
  title?: string;
  linkUrl?: string | null;
};

async function resolveJobId(): Promise<string> {
  if (jobIdArg) return jobIdArg;
  if (!useLatestFailed) {
    console.error("Specify --job-id=<id> or --latest-failed");
    process.exit(1);
  }
  const job = await prisma.notificationJob.findFirst({
    where: { status: "FAILED", failureCount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!job) {
    console.error("FAILED の NotificationJob が見つかりません");
    process.exit(1);
  }
  return job.id;
}

async function main() {
  const jobId = await resolveJobId();
  const job = await prisma.notificationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      totalCount: true,
      successCount: true,
      failureCount: true,
      payload: true,
    },
  });
  if (!job) {
    console.error(`NotificationJob not found: ${jobId}`);
    process.exit(1);
  }

  const payload = (job.payload ?? {}) as JobPayload;
  if (!payload.target) {
    console.error("ジョブ payload に target がありません");
    process.exit(1);
  }

  const sample = await prisma.notification.findFirst({
    where: {
      relatedId: jobId,
      type: "ADMIN_BROADCAST",
    },
    select: { title: true, body: true, linkUrl: true },
  });
  if (!sample) {
    console.error("既存の ADMIN_BROADCAST 通知が無く、本文を復元できません");
    process.exit(1);
  }

  const allTargetIds = await resolveBroadcastTargetUserIds({
    target: payload.target,
    role: payload.role ?? undefined,
  });

  const alreadySent = await prisma.notification.findMany({
    where: {
      relatedId: jobId,
      type: "ADMIN_BROADCAST",
    },
    select: { userId: true },
  });
  const sentSet = new Set(alreadySent.map((n) => n.userId));
  const pendingIds = allTargetIds.filter((id) => !sentSet.has(id));

  console.log("job:", jobId);
  console.log("status:", job.status, "counts:", {
    total: job.totalCount,
    success: job.successCount,
    failure: job.failureCount,
  });
  console.log("target users:", allTargetIds.length, "already sent:", sentSet.size, "pending:", pendingIds.length);

  if (pendingIds.length === 0) {
    console.log("再送対象がありません");
    return;
  }

  if (dryRun) {
    console.log("[dry-run] would resend to", pendingIds.length, "users");
    return;
  }

  const { successCount, failureCount } = await createBroadcastNotifications({
    userIds: pendingIds,
    category: "SYSTEM",
    type: "ADMIN_BROADCAST",
    title: sample.title,
    body: sample.body,
    relatedId: jobId,
    linkUrl: sample.linkUrl ?? payload.linkUrl ?? undefined,
  });

  const newSuccess = (job.successCount ?? 0) + successCount;
  const newFailure = Math.max(0, (job.failureCount ?? 0) - successCount) + failureCount;
  const newStatus = newFailure > 0 ? "FAILED" : "SENT";

  await prisma.notificationJob.update({
    where: { id: jobId },
    data: {
      status: newStatus,
      successCount: newSuccess,
      failureCount: newFailure,
    },
  });

  console.log("resend done:", { successCount, failureCount, jobStatus: newStatus, newSuccess, newFailure });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
