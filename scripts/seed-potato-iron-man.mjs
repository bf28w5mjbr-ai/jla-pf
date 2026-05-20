/**
 * ローカル検証用: 大会「POTATO CHALLENGE Yuigahama IRON」の IRON MAN 種目に、
 * 所属なし（clubId null）の個人エントリーを 50 件作成する。
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-potato-iron-man.mjs
 *   node --env-file=.env.local scripts/seed-potato-iron-man.mjs --force
 *   node --env-file=.env.local scripts/seed-potato-iron-man.mjs --dry-run
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPETITION_NAME = "POTATO CHALLENGE Yuigahama IRON";
const EVENT_NAME = "IRON MAN";
const ORG_NAME = "POTATO CHALLENGE テスト主催団体";
const SEED_EMAIL_MARKER = "potato-iron-man-iron.seed";
const TARGET_ENTRIES = 50;

function parseArgs() {
  const a = process.argv.slice(2);
  return { dryRun: a.includes("--dry-run"), force: a.includes("--force") };
}

function phoneFor(globalIndex) {
  return `+8180${String(10_000_000 + globalIndex).padStart(8, "0")}`;
}

async function cleanupSeedEventAndUsers(eventId) {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      items: { some: { eventId } },
      user: { email: { contains: SEED_EMAIL_MARKER } },
    },
    select: { id: true, userId: true },
  });
  if (entries.length === 0) return;
  const entryIds = entries.map((e) => e.id);
  const userIds = [...new Set(entries.map((e) => e.userId))];
  await prisma.entryItem.deleteMany({ where: { entryId: { in: entryIds } } });
  await prisma.competitionEntry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`削除: エントリー ${entryIds.length} 件、ユーザー ${userIds.length} 人`);
}

async function main() {
  const { dryRun, force } = parseArgs();

  let competition = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
  });

  let event = competition
    ? await prisma.event.findFirst({
        where: { competitionId: competition.id, name: EVENT_NAME },
      })
    : null;

  if (force && competition && event && !dryRun) {
    await cleanupSeedEventAndUsers(event.id);
    event = await prisma.event.findFirst({
      where: { competitionId: competition.id, name: EVENT_NAME },
    });
  }

  if (dryRun) {
    console.log("[dry-run] 作成・削除は行いません。");
    console.log({
      competitionExists: !!competition,
      eventExists: !!event,
      competitionName: COMPETITION_NAME,
      eventName: EVENT_NAME,
      targetEntries: TARGET_ENTRIES,
      clubId: null,
    });
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const entryEnd = new Date(now);
  entryEnd.setDate(entryEnd.getDate() - 1);

  if (!competition) {
    let org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: ORG_NAME,
          status: "APPROVED",
          onboardingFeeStatus: "PAID",
        },
      });
      console.log(`主催団体を作成: ${org.id}`);
    }

    competition = await prisma.competition.create({
      data: {
        organizationId: org.id,
        name: COMPETITION_NAME,
        category: "オーシャン",
        startDate: start,
        endDate: end,
        venue: "Yuigahama Beach (test)",
        entryStartDate: new Date(start.getTime() - 86400000 * 14),
        entryEndDate: entryEnd,
        status: "PUBLISHED",
        isPublished: true,
        publishedAt: new Date(),
        entryFee: { individualEntryFee: 0, teamEntryFeePerTeam: 0 },
      },
    });
    console.log(`大会を作成: ${competition.id}`);
  }

  if (!event) {
    const maxOrder =
      (
        await prisma.event.aggregate({
          where: { competitionId: competition.id },
          _max: { displayOrder: true },
        })
      )._max.displayOrder ?? -1;

    event = await prisma.event.create({
      data: {
        competitionId: competition.id,
        name: EVENT_NAME,
        sex: "MALE",
        type: "INDIVIDUAL",
        category: "OCEAN",
        requiresEntryTime: false,
        displayOrder: maxOrder + 1,
        preliminaryHeatLaneCount: 16,
      },
    });
    console.log(`種目を作成: ${event.id} (${EVENT_NAME})`);
  } else if (event.preliminaryHeatLaneCount == null || event.preliminaryHeatLaneCount < 1) {
    await prisma.event.update({
      where: { id: event.id },
      data: { preliminaryHeatLaneCount: 16 },
    });
    console.log(`種目の最大レーン数を 16 に更新しました`);
  }

  const existingSeedCount = await prisma.competitionEntry.count({
    where: {
      competitionId: competition.id,
      user: { email: { contains: SEED_EMAIL_MARKER } },
      items: { some: { eventId: event.id } },
    },
  });

  if (existingSeedCount >= TARGET_ENTRIES) {
    console.log(`既にシードエントリーが ${existingSeedCount} 件あります。--force で作り直せます。`);
    await prisma.$disconnect();
    return;
  }

  const need = TARGET_ENTRIES - existingSeedCount;
  console.log(`追加作成目標: ${need} 件（既存シード ${existingSeedCount} 件）`);

  let created = 0;
  for (let n = 1; n <= TARGET_ENTRIES && created < need; n += 1) {
    const email = `${SEED_EMAIL_MARKER}.${n}@seed.local`;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) continue;

    const dob = new Date(1988, 0, 1 + (n % 28));
    const phone = phoneFor(n + 2000);

    const user = await prisma.user.create({
      data: {
        email,
        profile: {
          create: {
            familyName: "IronMan",
            givenName: `Seed${n}`,
            familyNameKana: "アイアンマン",
            givenNameKana: "シード",
            normalizedFamilyName: "ironman",
            normalizedGivenName: `seed${n}`,
            dateOfBirth: dob,
            sex: "MALE",
          },
        },
        contact: {
          create: {
            phoneNumber: phone,
            phoneVerified: true,
          },
        },
        address: {
          create: {
            postalCode: "2480006",
            prefecture: "神奈川県",
            city: "鎌倉市",
            addressLine1: "テスト1-1",
          },
        },
      },
    });

    const entry = await prisma.competitionEntry.create({
      data: {
        competitionId: competition.id,
        userId: user.id,
        clubId: null,
        status: "SUBMITTED",
        totalFee: 0,
        items: {
          create: [{ eventId: event.id, entryTime: null }],
        },
      },
    });

    created += 1;
    console.log(`エントリー: ${email} → ${entry.id} (club なし)`);
  }

  const total = await prisma.competitionEntry.count({
    where: {
      competitionId: competition.id,
      items: { some: { eventId: event.id } },
    },
  });

  console.log("\n完了:");
  console.log(`  大会: ${COMPETITION_NAME} (${competition.id})`);
  console.log(`  種目: ${EVENT_NAME} (${event.id})`);
  console.log(`  今回作成: ${created} 件`);
  console.log(`  当該種目エントリー合計: ${total} 件（シード以外を含む）`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
