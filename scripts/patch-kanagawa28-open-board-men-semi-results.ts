/**
 * 第28回神奈川：オープンボードレース（男子）準決勝（SEMI）リザルト差し替え
 * - スナップショットに SEMI 2ヒート（各15レーン）を追加
 * - OfficialResult SEMI の全行を指定順位で置換
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-men-semi-results.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-men-semi-results.ts --execute
 */
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import {
  reorderRounds,
  type StartListHeat,
  type StartListParticipant,
  type StartListRoundData,
} from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング";
const EVENT_NAME = "オープンボードレース";
const EVENT_SEX = "MALE" as const;

type LaneSpec = {
  familyName: string;
  givenName: string;
  clubContains: string;
  rank: number;
  altFamilyName?: string;
};

const SEMI_HEATS: ReadonlyArray<{ heatIndex: number; lanes: readonly LaneSpec[] }> = [
  {
    heatIndex: 1,
    lanes: [
      { familyName: "秋本", givenName: "幹太", clubContains: "大磯", rank: 15 },
      { familyName: "吉田", givenName: "唯人", clubContains: "湯河原", rank: 2 },
      { familyName: "狩野", givenName: "陽太", clubContains: "南伊豆", rank: 3 },
      { familyName: "成田", givenName: "湊", clubContains: "西浜", rank: 4 },
      { familyName: "鈴木", givenName: "雷矢", clubContains: "西浜", rank: 9 },
      { familyName: "井上", givenName: "大地", clubContains: "西浜", rank: 14 },
      { familyName: "安達", givenName: "雄太", clubContains: "勝浦", rank: 12 },
      { familyName: "小堀", givenName: "湊一朗", clubContains: "大磯", rank: 10 },
      { familyName: "高須", givenName: "快晴", clubContains: "鹿嶋", rank: 1, altFamilyName: "髙須" },
      { familyName: "中山", givenName: "孟徳", clubContains: "南伊豆", rank: 11 },
      { familyName: "後川", givenName: "由眞", clubContains: "茅ヶ崎", rank: 8 },
      { familyName: "北村", givenName: "瑚太朗", clubContains: "茅ヶ崎", rank: 13 },
      { familyName: "師岡", givenName: "大周", clubContains: "湯河原", rank: 7 },
      { familyName: "上野", givenName: "凌", clubContains: "西浜", rank: 6 },
      { familyName: "新川", givenName: "将吾", clubContains: "西浜", rank: 5 },
    ],
  },
  {
    heatIndex: 2,
    lanes: [
      { familyName: "小林", givenName: "大河", clubContains: "下田", rank: 9 },
      { familyName: "志賀", givenName: "海空", clubContains: "西浜", rank: 10 },
      { familyName: "三浦", givenName: "隆大", clubContains: "横浜海", rank: 13 },
      { familyName: "本間", givenName: "春翔", clubContains: "大磯", rank: 15 },
      { familyName: "浜地", givenName: "櫂依", clubContains: "西浜", rank: 2 },
      { familyName: "近藤", givenName: "大輝", clubContains: "西浜", rank: 11 },
      { familyName: "井上", givenName: "駿佑", clubContains: "南伊豆", rank: 6 },
      { familyName: "山田", givenName: "海斗", clubContains: "西浜", rank: 14 },
      { familyName: "石田", givenName: "周也", clubContains: "湯河原", rank: 8 },
      { familyName: "相澤", givenName: "虎大", clubContains: "西浜", rank: 1 },
      { familyName: "高木", givenName: "惇暉", clubContains: "東京消防", rank: 5 },
      { familyName: "榎本", givenName: "宏暉", clubContains: "勝浦", rank: 4 },
      { familyName: "新井", givenName: "涼介", clubContains: "九十九里", rank: 7 },
      { familyName: "中澤", givenName: "美晴", clubContains: "茅ヶ崎", rank: 12 },
      { familyName: "二瓶", givenName: "航", clubContains: "松崎", rank: 3 },
    ],
  },
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
      sex: EVENT_SEX,
    },
    select: { id: true, name: true, sex: true, type: true },
  });
  if (!event) {
    console.error(`種目が見つかりません: ${EVENT_NAME} (${EVENT_SEX})`);
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
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
  });

  type Resolved = {
    heatIndex: number;
    lane: number;
    rank: number;
    entryId: string;
    userId: string;
    name: string;
    clubName: string | null;
    clubId: string | null;
  };

  const resolved: Resolved[] = [];

  for (const heat of SEMI_HEATS) {
    for (let lane = 0; lane < heat.lanes.length; lane += 1) {
      const row = heat.lanes[lane]!;
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
          `H${heat.heatIndex} L${lane + 1} ${fullName(row.familyName, row.givenName)}: マッチ ${matches.length} 件`
        );
        for (const m of matches) {
          console.error(
            `  - ${m.user.profile?.familyName} ${m.user.profile?.givenName} (${m.club?.name}) ${m.id}`
          );
        }
        process.exit(1);
      }
      const m = matches[0]!;
      const name = fullName(m.user.profile?.familyName ?? "", m.user.profile?.givenName ?? "");
      resolved.push({
        heatIndex: heat.heatIndex,
        lane: lane + 1,
        rank: row.rank,
        entryId: m.id,
        userId: m.userId,
        name,
        clubName: m.club?.name ?? null,
        clubId: m.club?.id ?? null,
      });
      console.log(
        `H${heat.heatIndex} L${String(lane + 1).padStart(2)} rank${String(row.rank).padStart(2)} ${name} (${m.club?.name})`
      );
    }
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
  console.log("\n変更前ラウンド:", (before ?? []).map((r) => `${r.round}(${r.heats.length})`).join(", "));

  const heatRound = (before ?? []).find((r) => r.round === "HEAT");
  if (!heatRound) {
    console.error("HEAT ラウンドがありません");
    process.exit(1);
  }

  const semiHeats: StartListHeat[] = SEMI_HEATS.map((heat) => ({
    heatIndex: heat.heatIndex,
    participants: heat.lanes.map((_, laneIdx) => {
      const r = resolved.find((x) => x.heatIndex === heat.heatIndex && x.lane === laneIdx + 1)!;
      return {
        kind: "INDIVIDUAL" as const,
        entryId: r.entryId,
        userId: r.userId,
        name: r.name,
        clubId: r.clubId,
        clubName: r.clubName,
      } satisfies StartListParticipant;
    }),
  }));

  const semiRound: StartListRoundData = {
    round: "SEMI",
    generatedAt: new Date().toISOString(),
    generatedBy: "RECORD_CAPTURE",
    heats: semiHeats,
  };

  const tail = (before ?? []).filter((r) => r.round !== "HEAT" && r.round !== "SEMI");
  const nextRounds = reorderRounds([heatRound, semiRound, ...tail]);

  const existingOfficial = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: comp.id,
        eventId: event.id,
        round: "SEMI",
      },
    },
    select: { id: true, lockedAt: true, rows: { select: { id: true } } },
  });

  if (existingOfficial?.lockedAt) {
    console.error("OfficialResult SEMI はロック済みです");
    process.exit(1);
  }

  console.log("\n変更後ラウンド:", nextRounds.map((r) => `${r.round}(${r.heats.length})`).join(", "));
  console.log(
    "OfficialResult SEMI:",
    existingOfficial ? `既存 ${existingOfficial.rows.length} 行 → ${resolved.length} 行` : `新規 ${resolved.length} 行`
  );

  if (dryRun) return;

  const now = new Date();
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
    type: event.type,
    rounds: nextRounds,
  };
  if (idx >= 0) events[idx] = nextBlock;
  else events.push(nextBlock);

  await prisma.$transaction(async (tx) => {
    await tx.competitionStartListSnapshot.update({
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

    const officialResult = await tx.officialResult.upsert({
      where: {
        competitionId_eventId_round: {
          competitionId: comp.id,
          eventId: event.id,
          round: "SEMI",
        },
      },
      create: {
        competitionId: comp.id,
        eventId: event.id,
        round: "SEMI",
      },
      update: {},
      select: { id: true },
    });

    await tx.officialResultRow.deleteMany({ where: { officialResultId: officialResult.id } });
    await tx.officialResultHeatConfirmed.deleteMany({
      where: { officialResultId: officialResult.id },
    });

    await tx.officialResultRow.createMany({
      data: resolved.map((r) => ({
        officialResultId: officialResult.id,
        entryType: "INDIVIDUAL" as const,
        competitionEntryId: r.entryId,
        teamEntryId: null,
        rank: r.rank,
        status: "OK" as const,
        heat: r.heatIndex,
        lane: r.lane,
        unit: "OTHER" as const,
      })),
    });

    for (const heatIndex of [1, 2]) {
      await tx.officialResultHeatConfirmed.create({
        data: {
          officialResultId: officialResult.id,
          heat: heatIndex,
        },
      });
    }
  });

  console.log("\n[execute] SEMI スナップショット・公式リザルトを更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
