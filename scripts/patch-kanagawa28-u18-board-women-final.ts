/**
 * 第28回神奈川：U-18ボードレース（女子）の決勝スタートリストを手動差し替え。
 * - 準決勝（SEMI）をスナップショットから除去
 * - 決勝（FINAL）を指定16名・順序で1ヒートに設定
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-board-women-final.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-board-women-final.ts --execute
 */
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { reorderRounds, type StartListParticipant, type StartListRoundData } from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング選手権";
const EVENT_NAME = "U-18ボードレース";

const FINAL_LINEUP: ReadonlyArray<{
  familyName: string;
  givenName: string;
  clubContains: string;
  altFamilyName?: string;
}> = [
  { familyName: "兼田", givenName: "笑那", clubContains: "西浜" },
  { familyName: "成海", givenName: "幸波", clubContains: "館山" },
  { familyName: "井上", givenName: "夏帆", clubContains: "西浜" },
  { familyName: "古賀", givenName: "夏美", clubContains: "西浜" },
  { familyName: "髙田", givenName: "琉衣", clubContains: "GoldenAge", altFamilyName: "高田" },
  { familyName: "鴨林", givenName: "夏花", clubContains: "西浜" },
  { familyName: "内藤", givenName: "希音", clubContains: "鎌倉" },
  { familyName: "吉原", givenName: "香陽", clubContains: "十文字" },
  { familyName: "藤﨑", givenName: "笑佳", clubContains: "西浜", altFamilyName: "藤崎" },
  { familyName: "塚根", givenName: "小夏", clubContains: "GoldenAge" },
  { familyName: "上野", givenName: "美月", clubContains: "西浜" },
  { familyName: "矢上", givenName: "陽葉", clubContains: "館山" },
  { familyName: "柳", givenName: "輝於", clubContains: "日本体育大学荏原" },
  { familyName: "河端", givenName: "詩央梨", clubContains: "KITAJIMA" },
  { familyName: "花塚", givenName: "聖奈", clubContains: "西浜" },
  { familyName: "槍田", givenName: "愛", clubContains: "西浜" },
];

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function fullName(familyName: string, givenName: string) {
  return `${familyName} ${givenName}`.trim();
}

async function findCompetition() {
  let comp = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
    select: { id: true, name: true },
  });
  if (!comp) {
    comp = await prisma.competition.findFirst({
      where: { name: { contains: NAME_FALLBACK } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
  }
  return comp;
}

async function main() {
  const comp = await findCompetition();
  if (!comp) {
    console.error(`大会が見つかりません: ${COMPETITION_NAME}`);
    process.exit(1);
  }

  const event = await prisma.event.findFirst({
    where: {
      competitionId: comp.id,
      name: EVENT_NAME,
      type: "INDIVIDUAL",
      sex: "FEMALE",
    },
    select: { id: true, name: true, sex: true },
  });
  if (!event) {
    console.error(`種目が見つかりません: ${EVENT_NAME} (女子個人)`);
    process.exit(1);
  }

  console.log(`大会: ${comp.name} (${comp.id})`);
  console.log(`種目: ${event.name} (${event.id}) ${event.sex}`);
  console.log(dryRun ? "[dry-run]" : "[execute]");

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: comp.id,
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId: event.id } },
    },
    select: {
      id: true,
      userId: true,
      club: { select: { id: true, name: true } },
      user: {
        select: {
          profile: {
            select: { familyName: true, givenName: true },
          },
        },
      },
    },
  });

  const participants: StartListParticipant[] = [];
  for (let i = 0; i < FINAL_LINEUP.length; i += 1) {
    const row = FINAL_LINEUP[i]!;
    const names = [row.familyName, row.altFamilyName].filter(Boolean) as string[];
    const matches = entries.filter((e) => {
      const fn = e.user.profile?.familyName ?? "";
      const gn = e.user.profile?.givenName ?? "";
      const club = e.club?.name ?? "";
      if (!names.includes(fn) || gn !== row.givenName) return false;
      return club.includes(row.clubContains);
    });
    if (matches.length !== 1) {
      console.error(
        `行${i + 1} ${fullName(row.familyName, row.givenName)}: マッチ ${matches.length} 件`
      );
      for (const m of matches) {
        console.error(
          `  - entry=${m.id} ${m.user.profile?.familyName} ${m.user.profile?.givenName} (${m.club?.name})`
        );
      }
      const loose = entries.filter((e) => {
        const gn = e.user.profile?.givenName ?? "";
        return gn === row.givenName;
      });
      if (loose.length > 0) {
        console.error("  givenName のみ一致:");
        for (const m of loose) {
          console.error(
            `  - ${m.user.profile?.familyName} ${m.user.profile?.givenName} (${m.club?.name})`
          );
        }
      }
      process.exit(1);
    }
    const m = matches[0]!;
    const name = fullName(m.user.profile?.familyName ?? "", m.user.profile?.givenName ?? "");
    participants.push({
      kind: "INDIVIDUAL",
      entryId: m.id,
      userId: m.userId,
      name,
      clubId: m.club?.id ?? null,
      clubName: m.club?.name ?? null,
    });
    console.log(`${String(i + 1).padStart(2)} ${name} (${m.club?.name})`);
  }

  const snapshot = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: comp.id },
    select: { id: true, data: true },
  });
  if (!snapshot?.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  const before = extractFrozenRoundsForEventFromSnapshotData(snapshot.data, event.id);
  console.log("\n変更前ラウンド:", (before ?? []).map((r) => `${r.round}(${r.heats.length} heats)`).join(", "));

  const heatRound = (before ?? []).find((r) => r.round === "HEAT");
  if (!heatRound) {
    console.error("HEAT ラウンドがありません");
    process.exit(1);
  }

  const finalRound: StartListRoundData = {
    round: "FINAL",
    generatedAt: new Date().toISOString(),
    generatedBy: "RECORD_CAPTURE",
    heats: [{ heatIndex: 1, participants }],
  };

  const nextRounds = reorderRounds([heatRound, finalRound]);

  if (dryRun) {
    console.log("\n変更後ラウンド:", nextRounds.map((r) => `${r.round}(${r.heats.length} heats)`).join(", "));
    await prisma.$disconnect();
    return;
  }

  const raw = snapshot.data as { version?: number; capturedAt?: string; events?: unknown[] };
  const events = Array.isArray(raw.events) ? [...raw.events] : [];
  const idx = events.findIndex(
    (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === event.id
  );
  const prevBlock =
    idx >= 0 && events[idx] && typeof events[idx] === "object"
      ? (events[idx] as Record<string, unknown>)
      : {};
  const nextBlock = {
    ...prevBlock,
    eventId: event.id,
    name: event.name,
    sex: event.sex,
    type: "INDIVIDUAL",
    rounds: nextRounds,
  };
  if (idx >= 0) events[idx] = nextBlock;
  else events.push(nextBlock);

  const now = new Date();
  await prisma.competitionStartListSnapshot.update({
    where: { competitionId: comp.id },
    data: {
      data: {
        ...raw,
        version: typeof raw.version === "number" ? raw.version : 2,
        capturedAt: now.toISOString(),
        events,
      },
      capturedAt: now,
    },
  });

  const after = extractFrozenRoundsForEventFromSnapshotData(
    (
      await prisma.competitionStartListSnapshot.findUnique({
        where: { competitionId: comp.id },
        select: { data: true },
      })
    )?.data,
    event.id
  );
  console.log("\n更新完了。変更後:", (after ?? []).map((r) => `${r.round}(${r.heats.length} heats)`).join(", "));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
