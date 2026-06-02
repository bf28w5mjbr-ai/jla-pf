/**
 * 第28回神奈川：U-18ボードレース（男子）決勝（FINAL）スタートリスト・リザルト差し替え
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-board-men-final-results.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-board-men-final-results.ts --execute
 */
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import {
  reorderRounds,
  type StartListParticipant,
  type StartListRoundData,
} from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnuyd66z0004l4046fejqkdn";

type LaneSpec = {
  familyName: string;
  givenName: string;
  clubContains: string;
  rank: number | null;
  status: "OK" | "DNF";
  altFamilyName?: string;
  altGivenName?: string;
};

/** 記録用紙（2026/5/30 決勝）コース順 */
const FINAL_LANES: readonly LaneSpec[] = [
  { familyName: "西川", givenName: "温人", clubContains: "西浜", rank: 2, status: "OK" },
  {
    familyName: "井上",
    givenName: "瑛太",
    clubContains: "日本体育大学荏原",
    rank: 13,
    status: "OK",
  },
  { familyName: "大野", givenName: "快", clubContains: "鎌倉", rank: 7, status: "OK" },
  {
    familyName: "舘野",
    givenName: "嵩治",
    clubContains: "KITAJIMA",
    rank: 14,
    status: "OK",
    altFamilyName: "館野",
  },
  { familyName: "小松", givenName: "壮", clubContains: "館山", rank: 5, status: "OK" },
  {
    familyName: "村上",
    givenName: "漣",
    clubContains: "茅ヶ崎",
    rank: 10,
    status: "OK",
    altGivenName: "蓮",
  },
  {
    familyName: "百田",
    givenName: "梅吉",
    clubContains: "KITAJIMA",
    rank: null,
    status: "DNF",
  },
  { familyName: "田畑", givenName: "佑笑", clubContains: "西浜", rank: 6, status: "OK" },
  {
    familyName: "高田",
    givenName: "理世",
    clubContains: "西浜",
    rank: 1,
    status: "OK",
    altFamilyName: "髙田",
  },
  {
    familyName: "小島",
    givenName: "徠叶",
    clubContains: "日本体育大学荏原",
    rank: 15,
    status: "OK",
  },
  { familyName: "米林", givenName: "志", clubContains: "鎌倉", rank: 11, status: "OK" },
  { familyName: "菅野", givenName: "滉太", clubContains: "西浜", rank: 4, status: "OK" },
  { familyName: "小川", givenName: "結生", clubContains: "西浜", rank: 8, status: "OK" },
  {
    familyName: "海野",
    givenName: "陽太郎",
    clubContains: "日本体育大学荏原",
    rank: 12,
    status: "OK",
  },
  { familyName: "渡辺", givenName: "敬太", clubContains: "湘南ひらつか", rank: 9, status: "OK" },
  { familyName: "井上", givenName: "大地", clubContains: "西浜", rank: 3, status: "OK" },
];

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function fullName(familyName: string, givenName: string) {
  return `${familyName} ${givenName}`.trim();
}

async function main() {
  const comp = await prisma.competition.findUnique({
    where: { id: COMPETITION_ID },
    select: { id: true, name: true },
  });
  if (!comp) {
    console.error(`大会が見つかりません: ${COMPETITION_ID}`);
    process.exit(1);
  }

  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { id: true, name: true, sex: true, type: true, competitionId: true },
  });
  if (!event || event.competitionId !== comp.id) {
    console.error(`種目が見つかりません: ${EVENT_ID}`);
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
    lane: number;
    rank: number | null;
    status: "OK" | "DNF";
    entryId: string;
    userId: string;
    name: string;
    clubName: string | null;
    clubId: string | null;
  };

  const resolved: Resolved[] = [];

  for (let lane = 0; lane < FINAL_LANES.length; lane += 1) {
    const row = FINAL_LANES[lane]!;
    const familyNames = [row.familyName, row.altFamilyName].filter(Boolean) as string[];
    const givenNames = [row.givenName, row.altGivenName].filter(Boolean) as string[];
    const matches = entries.filter((e) => {
      const fn = e.user.profile?.familyName ?? "";
      const gn = e.user.profile?.givenName ?? "";
      const club = e.club?.name ?? "";
      if (!familyNames.includes(fn) || !givenNames.includes(gn)) return false;
      return club.includes(row.clubContains);
    });
    if (matches.length !== 1) {
      console.error(
        `L${lane + 1} ${fullName(row.familyName, row.givenName)}: マッチ ${matches.length} 件`
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
      lane: lane + 1,
      rank: row.rank,
      status: row.status,
      entryId: m.id,
      userId: m.userId,
      name,
      clubName: m.club?.name ?? null,
      clubId: m.club?.id ?? null,
    });
    const rankLabel = row.rank != null ? String(row.rank) : row.status;
    console.log(
      `L${String(lane + 1).padStart(2)} ${rankLabel.padStart(3)} ${name} (${m.club?.name})`
    );
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

  const finalRound: StartListRoundData = {
    round: "FINAL",
    generatedAt: new Date().toISOString(),
    generatedBy: "RECORD_CAPTURE",
    heats: [
      {
        heatIndex: 1,
        participants: resolved.map(
          (r) =>
            ({
              kind: "INDIVIDUAL",
              entryId: r.entryId,
              userId: r.userId,
              name: r.name,
              clubId: r.clubId,
              clubName: r.clubName,
            }) satisfies StartListParticipant
        ),
      },
    ],
  };

  const nextRounds = reorderRounds([heatRound, finalRound]);

  const existingOfficial = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: comp.id,
        eventId: event.id,
        round: "FINAL",
      },
    },
    select: { id: true, lockedAt: true, rows: { select: { id: true } } },
  });

  if (existingOfficial?.lockedAt) {
    console.error("OfficialResult FINAL はロック済みです");
    process.exit(1);
  }

  console.log("\n変更後ラウンド:", nextRounds.map((r) => `${r.round}(${r.heats.length})`).join(", "));
  console.log(
    "OfficialResult FINAL:",
    existingOfficial
      ? `既存 ${existingOfficial.rows.length} 行 → ${resolved.length} 行`
      : `新規 ${resolved.length} 行`
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
          round: "FINAL",
        },
      },
      create: {
        competitionId: comp.id,
        eventId: event.id,
        round: "FINAL",
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
        status: r.status,
        heat: 1,
        lane: r.lane,
        unit: "OTHER" as const,
      })),
    });

    await tx.officialResultHeatConfirmed.create({
      data: {
        officialResultId: officialResult.id,
        heat: 1,
      },
    });
  });

  console.log("\n[execute] U18男子ボードレース FINAL を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
