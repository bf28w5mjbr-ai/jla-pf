/**
 * 期限切れ RegistrationSession を削除する。
 *
 * Usage:
 *   pnpm cleanup:registration-sessions:dry
 *   pnpm cleanup:registration-sessions
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";

function parseArgs() {
  let dryRun = true;
  for (const a of process.argv.slice(2)) {
    if (a === "--apply") dryRun = false;
    if (a === "--dry-run") dryRun = true;
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs();
  const now = new Date();

  const count = await prisma.registrationSession.count({
    where: { expiresAt: { lt: now } },
  });

  console.log(
    dryRun
      ? `[dry-run] delete expired registration sessions: ${count}`
      : `[apply] deleting expired registration sessions: ${count}`
  );

  if (!dryRun && count > 0) {
    const r = await prisma.registrationSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    console.log(`deleted: ${r.count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
