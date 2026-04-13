/**
 * 主催団体を「正式利用」相当の DB 状態にする（Stripe の実課金は行わない）。
 * - status: APPROVED
 * - onboardingFeeStatus: PAID, onboardingFeePaidAt: 現在時刻
 * - hasOrganizerPlatformSubscription 相当: 上記 PAID で満たす（サブスク ID は触らない）
 *
 * 有料エントリーには Connect（charges_enabled）も必要な場合がある。別途 Stripe Connect を完了するか、
 * 検証環境では STRIPE_CONNECT_SKIP_REQUIREMENT=true を参照。
 *
 * Usage:
 *   pnpm formalize:organization
 *   pnpm formalize:organization -- "団体名の一部"
 *
 * 接続: `DATABASE_URL_UNPOOLED` があれば優先（プーラーに届かないとき用）。未設定時は `DATABASE_URL`。
 */
import { PrismaClient } from "@prisma/client";
import { datasourceUrlForScripts } from "@/server/db";

const DEFAULT_NAMES = ["DAYDAY OPERATIONS", "DAY DAY OPERATIONS"];

function parseArgs() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const needle = argv[0]?.trim();
  return { needle: needle && needle.length > 0 ? needle : null };
}

async function main(): Promise<number> {
  const url = datasourceUrlForScripts();
  if (!url) {
    console.error("DATABASE_URL または DATABASE_URL_UNPOOLED を .env に設定してください。");
    return 1;
  }
  let host = "(unknown)";
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  const source = process.env.DATABASE_URL_UNPOOLED?.trim() ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
  console.log(`[formalize] 接続: ${source} → ${host}`);

  const prisma = new PrismaClient({
    datasourceUrl: url,
    log: ["error", "warn"],
  });
  try {
    const { needle } = parseArgs();
    const patterns = needle ? [needle] : DEFAULT_NAMES;

    const found = await prisma.organization.findMany({
      where: {
        OR: patterns.map((p) => ({
          name: { contains: p, mode: "insensitive" as const },
        })),
      },
      select: {
        id: true,
        name: true,
        status: true,
        onboardingFeeStatus: true,
        organizerSubscriptionStatus: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    });

    if (found.length === 0) {
      console.error(
        `該当する主催団体がありません（検索: ${patterns.join(", ")}）。団体名を引数で指定してください。`
      );
      return 1;
    }

    if (found.length > 1) {
      console.error("複数ヒットしました。引数で団体名を絞り込んでください:");
      for (const o of found) console.error(`  - ${o.id}\t${o.name}`);
      return 1;
    }

    const org = found[0]!;
    const now = new Date();

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        status: "APPROVED",
        onboardingFeeStatus: "PAID",
        onboardingFeePaidAt: now,
      },
    });

    const after = await prisma.organization.findUnique({
      where: { id: org.id },
      select: {
        id: true,
        name: true,
        status: true,
        onboardingFeeStatus: true,
        onboardingFeePaidAt: true,
        organizerSubscriptionStatus: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    });

    console.log("更新しました:");
    console.log(JSON.stringify({ before: org, after }, null, 2));
    return 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
