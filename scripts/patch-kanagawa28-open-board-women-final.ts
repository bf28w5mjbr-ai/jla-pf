/**
 * 第28回神奈川：オープンボードレース（女子）のスタートリストを手動差し替え。
 * - 準決勝（SEMI）ラウンドをスナップショットから除去（タブはブランク表示）
 * - 決勝（FINAL）を指定16名・順序で1ヒートに設定
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final.ts --execute
 */
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { reorderRounds, type StartListParticipant, type StartListRoundData } from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング選手権";
const EVENT_NAME = "オープンボードレース";

/** 決勝スタート順（familyName, givenName, clubNameContains） */
const FINAL_LINEUP: ReadonlyArray<{
  familyName: string;
  givenName: string;
  clubContains: string;
  altFamilyName?: string;
}> = [
  { familyName: "高橋", givenName: "陽", clubContains: "湯河原", altFamilyName: "髙橋" },
  { familyName: "浜地", givenName: "沙羅", clubContains: "西浜" },
  { familyName: "久保田", givenName: "純令", clubContains: "湯河原" },
  { familyName: "片平", givenName: "悠理亜メリッサ", clubContains: "西浜" },
  { familyName: "甚内", givenName: "優那", clubContains: "茅ヶ崎" },
  { familyName: "秋田", givenName: "香苗", clubContains: "湯河原" },
  { familyName: "小久保", givenName: "琴音", clubContains: "湯河原" },
  { familyName: "富田", givenName: "和佳子", clubContains: "西浜" },
  { familyName: "橋本", givenName: "歩佳", clubContains: "下田" },
  { familyName: "中島", givenName: "星南", clubContains: "大磯" },
  { familyName: "星野", givenName: "楓", clubContains: "南伊豆" },
  { familyName: "丸田", givenName: "葉月", clubContains: "茅ヶ崎" },
  { familyName: "三間", givenName: "彩矢", clubContains: "南伊豆" },
  { familyName: "榎本", givenName: "由里", clubContains: "勝浦" },
  { familyName: "今野", givenName: "恵", clubContains: "鎌倉" },
  { familyName: "奥野", givenName: "結実", clubContains: "西浜" },
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
    select: { id: true, data: true, capturedAt: true },
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
    console.log("決勝参加者数:", finalRound.heats[0]?.participants.length);
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
  const final = after?.find((r) => r.round === "FINAL");
  if (final) {
    for (const p of final.heats[0]?.participants ?? []) {
      if (p.kind === "INDIVIDUAL") console.log(`  ${p.name}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
