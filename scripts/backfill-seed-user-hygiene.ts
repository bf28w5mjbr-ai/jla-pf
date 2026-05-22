/**
 * @seed.local ユーザーのメール小文字化・phoneVerifiedAt 補完（読み取り/更新）。
 *
 * Usage:
 *   pnpm backfill:seed-user-hygiene:dry
 *   pnpm backfill:seed-user-hygiene
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

  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@seed.local" } },
    select: {
      id: true,
      email: true,
      createdAt: true,
      security: { select: { emailVerified: true } },
      contact: { select: { phoneVerified: true, phoneVerifiedAt: true } },
    },
  });

  let emailUpdates = 0;
  let phoneAtUpdates = 0;

  console.log(
    dryRun ? "[dry-run] seed user hygiene" : "[apply] seed user hygiene"
  );
  console.log(`seed users: ${users.length}`);

  for (const u of users) {
    const lower = u.email.toLowerCase();
    if (lower !== u.email) {
      emailUpdates += 1;
      console.log(`  email ${u.id}: ${u.email} -> ${lower}`);
      if (!dryRun) {
        await prisma.user.update({
          where: { id: u.id },
          data: { email: lower },
        });
      }
    }

    const c = u.contact;
    if (c?.phoneVerified && !c.phoneVerifiedAt) {
      phoneAtUpdates += 1;
      const at = u.createdAt;
      console.log(`  phoneVerifiedAt ${u.id}: set ${at.toISOString()}`);
      if (!dryRun) {
        await prisma.userContact.update({
          where: { userId: u.id },
          data: { phoneVerifiedAt: at },
        });
      }
    }
  }

  console.log(
    `\nemail lowercase: ${emailUpdates}, phoneVerifiedAt: ${phoneAtUpdates}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
