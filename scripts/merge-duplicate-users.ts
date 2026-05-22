/**
 * 重複ユーザーを統合: --keep 側に --drop 側の関連行を移し、drop ユーザーを削除する。
 * 情報量が多い userId を --keep に指定すること。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/merge-duplicate-users.ts --keep=<id> --drop=<id> --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/merge-duplicate-users.ts --keep=<id> --drop=<id> --apply
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";
import { normalizeKana } from "@/lib/normalize-kana";
import { Prisma } from "@prisma/client";

function parseArgs() {
  let keep = "";
  let drop = "";
  let dryRun = true;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--keep=")) keep = a.slice("--keep=".length);
    if (a.startsWith("--drop=")) drop = a.slice("--drop=".length);
    if (a === "--apply") dryRun = false;
    if (a === "--dry-run") dryRun = true;
  }
  if (!keep || !drop) {
    console.error(
      "Usage: merge-duplicate-users.ts --keep=<userId> --drop=<userId> [--dry-run|--apply]"
    );
    process.exit(1);
  }
  if (keep === drop) {
    console.error("keep と drop は別の userId を指定してください");
    process.exit(1);
  }
  return { keep, drop, dryRun };
}

async function reassignSimple(
  label: string,
  dryRun: boolean,
  count: () => Promise<number>,
  update: () => Promise<{ count: number }>
) {
  const n = await count();
  if (n === 0) return;
  if (dryRun) {
    console.log(`  [dry-run] ${label}: ${n} 件を移行`);
    return;
  }
  const r = await update();
  console.log(`  ${label}: ${r.count} 件移行`);
}

async function main() {
  const { keep, drop, dryRun } = parseArgs();

  const [keepUser, dropUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: keep },
      include: { profile: true, contact: true, security: true },
    }),
    prisma.user.findUnique({
      where: { id: drop },
      include: { profile: true, contact: true, security: true },
    }),
  ]);

  if (!keepUser || !dropUser) {
    console.error("keep または drop ユーザーが見つかりません");
    process.exit(1);
  }

  console.log(
    dryRun ? "[dry-run] merge users" : "[apply] merge users"
  );
  console.log(`  KEEP ${keepUser.email} (${keep})`);
  console.log(`  DROP ${dropUser.email} (${drop})`);

  const run = async () => {
    const w = { userId: drop };
    await reassignSimple(
      "userLoginEvent",
      dryRun,
      () => prisma.userLoginEvent.count({ where: w }),
      () => prisma.userLoginEvent.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "competitionEntry",
      dryRun,
      () => prisma.competitionEntry.count({ where: w }),
      () => prisma.competitionEntry.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "teamEntryMember",
      dryRun,
      () => prisma.teamEntryMember.count({ where: w }),
      () => prisma.teamEntryMember.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "membership",
      dryRun,
      () => prisma.membership.count({ where: w }),
      () => prisma.membership.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "orgAdmin",
      dryRun,
      () => prisma.orgAdmin.count({ where: w }),
      () => prisma.orgAdmin.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "qualification",
      dryRun,
      () => prisma.qualification.count({ where: w }),
      () => prisma.qualification.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "qualificationHistory",
      dryRun,
      () => prisma.qualificationHistory.count({ where: w }),
      () => prisma.qualificationHistory.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "notification",
      dryRun,
      () => prisma.notification.count({ where: w }),
      () => prisma.notification.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "entryCheckoutSession",
      dryRun,
      () => prisma.entryCheckoutSession.count({ where: w }),
      () => prisma.entryCheckoutSession.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "payment",
      dryRun,
      () => prisma.payment.count({ where: w }),
      () => prisma.payment.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "passkeyChallenge",
      dryRun,
      () => prisma.passkeyChallenge.count({ where: w }),
      () => prisma.passkeyChallenge.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "loginSession",
      dryRun,
      () => prisma.loginSession.count({ where: w }),
      () => prisma.loginSession.updateMany({ where: w, data: { userId: keep } })
    );
    await reassignSimple(
      "deviceToken",
      dryRun,
      () => prisma.deviceToken.count({ where: w }),
      () => prisma.deviceToken.updateMany({ where: w, data: { userId: keep } })
    );

    const dropPasskeys = await prisma.passkeyCredential.findMany({
      where: { userId: drop },
    });
    for (const pk of dropPasskeys) {
      const clash = await prisma.passkeyCredential.findFirst({
        where: { credentialId: pk.credentialId },
      });
      if (clash && clash.userId !== drop) {
        console.log(`  passkey ${pk.id}: credentialId 衝突のため DROP 側を削除`);
        if (!dryRun) {
          await prisma.passkeyCredential.delete({ where: { id: pk.id } });
        }
        continue;
      }
      console.log(`  passkey ${pk.id}: KEEP へ移行`);
      if (!dryRun) {
        await prisma.passkeyCredential.update({
          where: { id: pk.id },
          data: { userId: keep },
        });
      }
    }

    if (keepUser.profile) {
      const f = normalizeKana(keepUser.profile.familyNameKana);
      const g = normalizeKana(keepUser.profile.givenNameKana);
      console.log(
        `  profile normalized (${dryRun ? "after drop delete" : "next"}): ${keepUser.profile.normalizedFamilyName}/${keepUser.profile.normalizedGivenName} -> ${f}/${g}`
      );
    }

    if (dryRun) {
      console.log(`  [dry-run] user.delete: ${drop}`);
      return;
    }

    try {
      await prisma.user.delete({ where: { id: drop } });
      console.log(`  deleted drop user: ${drop}`);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "削除に失敗しました。未移行の参照が残っている可能性があります:",
          e.code,
          e.meta
        );
      }
      throw e;
    }

    if (keepUser.profile) {
      await prisma.userProfile.update({
        where: { userId: keep },
        data: {
          normalizedFamilyName: normalizeKana(keepUser.profile.familyNameKana),
          normalizedGivenName: normalizeKana(keepUser.profile.givenNameKana),
        },
      });
      console.log("  profile normalized: updated");
    }
  };

  if (dryRun) {
    await run();
    console.log("\n--apply で実行");
    return;
  }

  await prisma.$transaction(async () => {
    await run();
  });

  console.log("\n完了。pnpm audit:registration-data で確認してください。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
