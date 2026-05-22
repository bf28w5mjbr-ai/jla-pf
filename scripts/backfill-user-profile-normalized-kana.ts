/**
 * UserProfile の normalized* を normalizeKana(カナ入力) に揃える。
 * @seed.local は既定でスキップ（シードは member1 等の一意キーを意図的に使用）。
 *
 * Usage:
 *   pnpm backfill:profile-normalized-kana:dry
 *   pnpm backfill:profile-normalized-kana
 *   pnpm backfill:profile-normalized-kana -- --include-seed
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";
import { normalizeKana } from "@/lib/normalize-kana";

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = true;
  let includeSeed = false;
  for (const a of argv) {
    if (a === "--") continue;
    if (a === "--apply") dryRun = false;
    if (a === "--dry-run") dryRun = true;
    if (a === "--include-seed") includeSeed = true;
  }
  return { dryRun, includeSeed };
}

function profileKey(
  normalizedFamilyName: string,
  normalizedGivenName: string,
  dateOfBirth: Date
) {
  return `${normalizedFamilyName}\t${normalizedGivenName}\t${dateOfBirth.toISOString().slice(0, 10)}`;
}

function isSeedEmail(email: string) {
  return email.endsWith("@seed.local");
}

async function main() {
  const { dryRun, includeSeed } = parseArgs();

  const rows = await prisma.userProfile.findMany({
    select: {
      userId: true,
      familyNameKana: true,
      givenNameKana: true,
      normalizedFamilyName: true,
      normalizedGivenName: true,
      dateOfBirth: true,
      user: { select: { email: true } },
    },
  });

  type Plan = {
    userId: string;
    email: string;
    from: { f: string; g: string };
    to: { f: string; g: string };
  };

  const plans: Plan[] = [];
  let skippedSeed = 0;
  let skippedOk = 0;

  for (const p of rows) {
    const email = p.user.email;
    if (!includeSeed && isSeedEmail(email)) {
      skippedSeed += 1;
      continue;
    }
    const toF = normalizeKana(p.familyNameKana);
    const toG = normalizeKana(p.givenNameKana);
    if (p.normalizedFamilyName === toF && p.normalizedGivenName === toG) {
      skippedOk += 1;
      continue;
    }
    plans.push({
      userId: p.userId,
      email,
      from: { f: p.normalizedFamilyName, g: p.normalizedGivenName },
      to: { f: toF, g: toG },
    });
  }

  const planByUser = new Map(plans.map((x) => [x.userId, x]));

  const effectiveByKey = new Map<
    string,
    { userId: string; email: string }[]
  >();

  for (const p of rows) {
    const email = p.user.email;
    if (!includeSeed && isSeedEmail(email)) continue;

    const plan = planByUser.get(p.userId);
    const f = plan ? plan.to.f : p.normalizedFamilyName;
    const g = plan ? plan.to.g : p.normalizedGivenName;
    const key = profileKey(f, g, p.dateOfBirth);
    const arr = effectiveByKey.get(key) ?? [];
    arr.push({ userId: p.userId, email });
    effectiveByKey.set(key, arr);
  }

  const blockedUserIds = new Set<string>();
  for (const [, members] of effectiveByKey) {
    if (members.length > 1) {
      for (const m of members) blockedUserIds.add(m.userId);
    }
  }

  const conflictGroups = [...effectiveByKey.entries()].filter(
    ([, members]) => members.length > 1
  );

  console.log(
    dryRun ? "[dry-run] backfill normalized kana" : "[apply] backfill normalized kana"
  );
  console.log(`plans: ${plans.length}, skipped(seed): ${skippedSeed}, skipped(ok): ${skippedOk}`);
  console.log(`conflict groups: ${conflictGroups.length}`);

  for (const [key, members] of conflictGroups) {
    console.log(`  CONFLICT key=${key}`);
    for (const m of members) {
      console.log(`    · ${m.userId} (${m.email})`);
    }
  }

  const applicable = plans.filter((pl) => !blockedUserIds.has(pl.userId));

  for (const pl of applicable.slice(0, 20)) {
    console.log(
      `  ${pl.userId} ${pl.email}: ${pl.from.f}/${pl.from.g} -> ${pl.to.f}/${pl.to.g}`
    );
  }
  if (applicable.length > 20) {
    console.log(`  … 他 ${applicable.length - 20} 件`);
  }

  if (dryRun) {
    console.log(`\n適用可能: ${applicable.length} 件（--apply で実行）`);
    return;
  }

  let updated = 0;
  for (const pl of applicable) {
    await prisma.userProfile.update({
      where: { userId: pl.userId },
      data: {
        normalizedFamilyName: pl.to.f,
        normalizedGivenName: pl.to.g,
      },
    });
    updated += 1;
  }
  console.log(`\nupdated: ${updated}`);
  if (conflictGroups.length > 0) {
    console.log(
      "重複キー衝突のためスキップしたユーザーは手動統合後に再実行してください。"
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
