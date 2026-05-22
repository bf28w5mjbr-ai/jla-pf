/**
 * ローカル検証用: 大会「ssss」の男子個人種目に
 * A〜H の各チーム（クラブ）から 10 人ずつ、合計 80 人の個人エントリーを作成する。
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-ssss-open-board-men.mjs
 *   node --env-file=.env.local scripts/seed-ssss-open-board-men.mjs --event-name "オープンビーチフラッグス"
 *   node --env-file=.env.local scripts/seed-ssss-open-board-men.mjs --force
 *   node --env-file=.env.local scripts/seed-ssss-open-board-men.mjs --dry-run
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

const COMPETITION_NAME = "ssss";
const DEFAULT_EVENT_NAME = "オープンボードレース";
const TEAM_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const ENTRIES_PER_TEAM = 10;
const TARGET_ENTRIES = TEAM_LABELS.length * ENTRIES_PER_TEAM;
const SEED_EMAIL_MARKER = "ssss-open-board-men.seed";

function parseArgs() {
  const a = process.argv.slice(2);
  const nameIndex = a.indexOf("--event-name");
  const eventName =
    nameIndex >= 0 && a[nameIndex + 1] ? a[nameIndex + 1] : DEFAULT_EVENT_NAME;
  return {
    dryRun: a.includes("--dry-run"),
    force: a.includes("--force"),
    eventName,
  };
}

function phoneFor(globalIndex) {
  return `+8170${String(10_000_000 + globalIndex).padStart(8, "0")}`;
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

async function ensureTeamClubs() {
  const clubs = [];
  for (const label of TEAM_LABELS) {
    const name = `${COMPETITION_NAME} Team ${label}`;
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
    clubs.push({ label, club });
  }
  return clubs;
}

async function main() {
  const { dryRun, force, eventName } = parseArgs();

  const competition = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
    select: { id: true, name: true },
  });
  if (!competition) {
    throw new Error(`大会「${COMPETITION_NAME}」が見つかりません。先に大会を作成してください。`);
  }

  let event = await prisma.event.findFirst({
    where: {
      competitionId: competition.id,
      name: eventName,
      type: "INDIVIDUAL",
      sex: "MALE",
    },
    select: { id: true, name: true },
  });

  if (!event) {
    const eventNames = await prisma.event.findMany({
      where: { competitionId: competition.id },
      select: { name: true },
      orderBy: { displayOrder: "asc" },
    });
    const available = eventNames.map((e) => e.name).join(", ") || "（種目なし）";
    throw new Error(`大会「${COMPETITION_NAME}」に種目「${eventName}」(個人/男子) が見つかりません。現在の種目: ${available}`);
  }

  if (force && !dryRun) {
    await cleanupSeedEventAndUsers(event.id);
    event = await prisma.event.findUnique({
      where: { id: event.id },
      select: { id: true, name: true },
    });
  }

  if (dryRun) {
    console.log("[dry-run] 作成・削除は行いません。");
    console.log({
      competitionId: competition.id,
      competitionName: competition.name,
      eventId: event.id,
      eventName: event.name,
      teamCount: TEAM_LABELS.length,
      entriesPerTeam: ENTRIES_PER_TEAM,
      targetEntries: TARGET_ENTRIES,
    });
    await prisma.$disconnect();
    return;
  }

  const teams = await ensureTeamClubs();

  let created = 0;
  let skippedExistingUser = 0;
  let skippedExistingEntry = 0;
  let globalIndex = 0;

  for (const { label, club } of teams) {
    for (let member = 1; member <= ENTRIES_PER_TEAM; member += 1) {
      const email = `${SEED_EMAIL_MARKER}.team${label.toLowerCase()}.m${member}@seed.local`;
      const existed = await prisma.user.findUnique({ where: { email } });
      let userId = existed?.id ?? null;

      if (!userId) {
        const dob = new Date(1992, (globalIndex % 12), 1 + (globalIndex % 28));
        const phone = phoneFor(3000 + globalIndex);
        globalIndex += 1;

        const user = await prisma.user.create({
          data: {
            email,
            profile: {
              create: {
                familyName: `Team${label}`,
                givenName: `Member${member}`,
                familyNameKana: "チーム",
                givenNameKana: "メンバー",
                normalizedFamilyName: `team${label.toLowerCase()}`,
                normalizedGivenName: `member${member}`,
                dateOfBirth: dob,
                sex: "MALE",
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
        userId = user.id;
      } else {
        skippedExistingUser += 1;
      }

      const hasEntry = await prisma.competitionEntry.findFirst({
        where: {
          competitionId: competition.id,
          userId,
          items: { some: { eventId: event.id } },
        },
        select: { id: true },
      });
      if (hasEntry) {
        skippedExistingEntry += 1;
        continue;
      }

      const entry = await prisma.competitionEntry.create({
        data: {
          competitionId: competition.id,
          userId,
          clubId: club.id,
          status: "SUBMITTED",
          totalFee: 0,
          items: { create: [{ eventId: event.id, entryTime: null }] },
        },
      });

      created += 1;
      console.log(`エントリー作成: ${email} -> ${entry.id} (team ${label})`);
    }
  }

  const seedCount = await prisma.competitionEntry.count({
    where: {
      competitionId: competition.id,
      user: { email: { contains: SEED_EMAIL_MARKER } },
      items: { some: { eventId: event.id } },
    },
  });

  const totalForEvent = await prisma.competitionEntry.count({
    where: {
      competitionId: competition.id,
      items: { some: { eventId: event.id } },
    },
  });

  console.log("\n完了:");
  console.log(`  大会: ${competition.name} (${competition.id})`);
  console.log(`  種目: ${event.name} (${event.id})`);
  console.log(`  目標件数: ${TARGET_ENTRIES} 件`);
  console.log(`  今回作成: ${created} 件`);
  console.log(`  既存ユーザー再利用: ${skippedExistingUser} 件`);
  console.log(`  既存エントリーのためスキップ: ${skippedExistingEntry} 件`);
  console.log(`  当該シードの総数: ${seedCount} 件`);
  console.log(`  当該種目エントリー合計: ${totalForEvent} 件（シード以外を含む）`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
