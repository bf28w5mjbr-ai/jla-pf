/**
 * ローカル検証用: 大会「POTATO CHALLENGE Yuigahama IRON」の OCEAN WOMAN 種目に、
 * 9クラブから 2,3,5,8,10,12,15,20,25 人（計100人）の個人エントリーを作成する。
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-potato-ocean-woman.mjs
 *   node --env-file=.env.local scripts/seed-potato-ocean-woman.mjs --force   # 同一シードのエントリー・ユーザーを消して再作成
 *   node --env-file=.env.local scripts/seed-potato-ocean-woman.mjs --dry-run
 *
 * スタートリストの機能テスト（実DB）:
 *   pnpm test:start-list:db
 *   （シード後に vitest 統合テスト。.env.local は vitest.config で読み込み）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPETITION_NAME = "POTATO CHALLENGE Yuigahama IRON";
const EVENT_NAME = "OCEAN WOMAN";
const ORG_NAME = "POTATO CHALLENGE テスト主催団体";
const CLUB_NAME_PREFIX = "POTATO IRON TC";
/** メールに含め、--force 時の削除対象にする */
const SEED_EMAIL_MARKER = "potato-ocean-woman-iron.seed";
const ENTRIES_PER_CLUB = [2, 3, 5, 8, 10, 12, 15, 20, 25];

function parseArgs() {
  const a = process.argv.slice(2);
  return { dryRun: a.includes("--dry-run"), force: a.includes("--force") };
}

function phoneFor(globalIndex) {
  return `+8190${String(10_000_000 + globalIndex).padStart(8, "0")}`;
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

  if (ENTRIES_PER_CLUB.reduce((a, b) => a + b, 0) !== 100) {
    throw new Error("ENTRIES_PER_CLUB must sum to 100");
  }

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
      clubs: ENTRIES_PER_CLUB.length,
      totalEntrants: 100,
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
        sex: "FEMALE",
        type: "INDIVIDUAL",
        category: "OCEAN",
        requiresEntryTime: false,
        displayOrder: maxOrder + 1,
        preliminaryHeatLaneCount: 16,
      },
    });
    console.log(`種目を作成: ${event.id} (${EVENT_NAME})`);
  } else if (event.preliminaryHeatLaneCount !== 16) {
    await prisma.event.update({
      where: { id: event.id },
      data: { preliminaryHeatLaneCount: 16 },
    });
    console.log(`種目の最大レーン数を 16 に更新しました`);
  }

  const clubs = [];
  for (let i = 0; i < ENTRIES_PER_CLUB.length; i += 1) {
    const name = `${CLUB_NAME_PREFIX} ${i + 1}`;
    let club = await prisma.club.findFirst({ where: { name } });
    if (!club) {
      club = await prisma.club.create({
        data: {
          name,
          status: "APPROVED",
        },
      });
      console.log(`クラブ作成: ${name} (${club.id})`);
    }
    clubs.push(club);
  }

  const existingSeedCount = await prisma.competitionEntry.count({
    where: {
      competitionId: competition.id,
      user: { email: { contains: SEED_EMAIL_MARKER } },
      items: { some: { eventId: event.id } },
    },
  });

  if (existingSeedCount >= 100) {
    console.log(`既にシードエントリーが ${existingSeedCount} 件あります。--force で作り直せます。`);
    await prisma.$disconnect();
    return;
  }

  let globalUserIndex = 0;
  for (let clubIdx = 0; clubIdx < clubs.length; clubIdx += 1) {
    const club = clubs[clubIdx];
    const n = ENTRIES_PER_CLUB[clubIdx];

    for (let m = 0; m < n; m += 1) {
      const email = `${SEED_EMAIL_MARKER}.c${clubIdx + 1}.m${m + 1}@seed.local`;
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) continue;

      const dob = new Date(1990, 0, 1 + globalUserIndex);
      const phone = phoneFor(globalUserIndex);
      globalUserIndex += 1;

      const user = await prisma.user.create({
        data: {
          email,
          profile: {
            create: {
              familyName: `IronTeam${clubIdx + 1}`,
              givenName: `Member${m + 1}`,
              familyNameKana: "アイアンチーム",
              givenNameKana: "メンバー",
              normalizedFamilyName: `ironteam${clubIdx + 1}`,
              normalizedGivenName: `member${m + 1}`,
              dateOfBirth: dob,
              sex: "FEMALE",
            },
          },
          contact: {
            create: {
              phoneNumber: phone,
              phoneVerified: true,
              phoneVerifiedAt: new Date(),
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
          clubId: club.id,
          status: "SUBMITTED",
          totalFee: 0,
          items: {
            create: [{ eventId: event.id, entryTime: null }],
          },
        },
      });

      console.log(`エントリー: ${email} → ${entry.id} (club ${club.name})`);
    }
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
  console.log(`  当該種目エントリー合計: ${total} 件（シード以外を含む）`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
