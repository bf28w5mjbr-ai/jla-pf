/**
 * U15女子ビーチフラッグス: 印刷スタートリスト（2026/5/31 6:53）の HEAT/レーンに合わせる
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u15-women-beach-flags-startlist.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u15-women-beach-flags-startlist.ts --execute
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

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";

/** 印刷物どおり（ヒート → レーン順の氏名） */
const TARGET_PLACEMENT: readonly { heat: number; names: readonly string[] }[] = [
  {
    heat: 1,
    names: [
      "矢上 陽菜",
      "兼田 笑那",
      "上野 美月",
      "日吉 佐葵",
      "清水 里夏",
      "谷中 渚瑠",
      "吉原 香陽",
      "林 蒼",
      "森 多緒",
      "伊藤 彩音",
    ],
  },
  {
    heat: 2,
    names: [
      "草柳 凪咲",
      "丸塚 心結",
      "松田 糸",
      "細野 詩",
      "渡辺 倖希",
      "山下 玲愛",
      "常盤 珠絆",
      "上田 香蓮",
      "渡辺 心葉",
    ],
  },
  {
    heat: 3,
    names: [
      "内藤 希乃",
      "常盤 咲来",
      "大橋 希紘",
      "今宮 未瑛",
      "谷口 陽菜",
      "折田 優愛",
      "上田 蘭",
      "水野 真緒",
      "井上 夏帆",
    ],
  },
];

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function findEventId(): Promise<string> {
  const event = await prisma.event.findFirst({
    where: {
      competitionId: COMPETITION_ID,
      sex: "FEMALE",
      name: { contains: "ビーチフラッグ" },
      ageCategory: { name: { contains: "U-15" } },
    },
    select: { id: true, name: true },
  });
  if (!event) {
    console.error("U-15女子ビーチフラッグス種目が見つかりません");
    process.exit(1);
  }
  console.log("event:", event.id, event.name);
  return event.id;
}

/** 印刷物表記 → DB 登録名 */
const PRINT_NAME_ALIASES: Record<string, string> = {
  "矢上 陽菜": "矢上 陽葉",
  "日吉 佐葵": "日吉 佑菜",
};

function resolveParticipant(
  printName: string,
  byName: Map<string, StartListParticipant>
): StartListParticipant | null {
  const key = normalizeName(printName);
  const direct = byName.get(key);
  if (direct) return direct;
  const alias = PRINT_NAME_ALIASES[key];
  if (alias) return byName.get(normalizeName(alias)) ?? null;
  return null;
}

async function loadEntryByName(eventId: string): Promise<Map<string, StartListParticipant>> {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: COMPETITION_ID,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId } },
    },
    select: {
      id: true,
      userId: true,
      club: { select: { id: true, name: true } },
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
  });

  const map = new Map<string, StartListParticipant>();
  for (const e of entries) {
    const fn = e.user.profile?.familyName ?? "";
    const gn = e.user.profile?.givenName ?? "";
    const name = normalizeName(`${fn} ${gn}`);
    map.set(name, {
      kind: "INDIVIDUAL",
      entryId: e.id,
      userId: e.userId,
      name,
      clubId: e.club?.id ?? null,
      clubName: e.club?.name ?? null,
    });
  }
  return map;
}

async function main() {
  const eventId = await findEventId();
  const byName = await loadEntryByName(eventId);

  const targetNames = TARGET_PLACEMENT.flatMap((h) => h.names);
  console.log(`target participants: ${targetNames.length}, db entries: ${byName.size}`);

  const missing: string[] = [];
  const heats: StartListHeat[] = [];

  for (const block of TARGET_PLACEMENT) {
    const participants: StartListParticipant[] = [];
    for (const name of block.names) {
      const p = resolveParticipant(name, byName);
      if (!p) {
        missing.push(name);
        continue;
      }
      participants.push(p);
      console.log(`  heat ${block.heat} lane ${participants.length}: ${name} → ${p.name} (${p.clubName})`);
    }
    heats.push({ heatIndex: block.heat, participants });
  }

  if (missing.length > 0) {
    console.error("\nエントリーが見つからない選手:", missing);
    // 部分一致候補
    for (const m of missing) {
      const family = m.split(/\s+/)[0];
      const hits = [...byName.keys()].filter((n) => n.includes(family));
      if (hits.length) console.error(`  ${m} → 候補: ${hits.join(", ")}`);
    }
    process.exit(1);
  }

  const snapRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  if (!snapRow?.data) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  const before = extractFrozenRoundsForEventFromSnapshotData(snapRow.data, eventId);
  const currentHeat = before?.find((r) => r.round === "HEAT");
  console.log(
    "\nbefore heats:",
    currentHeat?.heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );
  console.log(
    "after heats:",
    heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );

  const newHeatRound: StartListRoundData = {
    round: "HEAT",
    generatedAt: currentHeat?.generatedAt ?? new Date().toISOString(),
    generatedBy: currentHeat?.generatedBy ?? "RECORD_CAPTURE",
    heats,
  };
  const tailRounds = (before ?? []).filter((r) => r.round !== "HEAT");
  const nextRounds = reorderRounds([newHeatRound, ...tailRounds]);

  if (dryRun) {
    console.log("\n[dry-run] rounds:", nextRounds.map((r) => r.round).join(", "));
    return;
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true, sex: true, type: true },
  });

  const raw = snapRow.data as { version?: number; capturedAt?: string; events?: unknown[] };
  const eventsArr = Array.isArray(raw.events) ? [...raw.events] : [];
  const idx = eventsArr.findIndex(
    (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === eventId
  );
  const prevBlock =
    idx >= 0 && eventsArr[idx] && typeof eventsArr[idx] === "object"
      ? (eventsArr[idx] as Record<string, unknown>)
      : {};
  const nextBlock = {
    ...prevBlock,
    eventId,
    name: event!.name,
    sex: event!.sex,
    type: event!.type,
    rounds: nextRounds,
  };
  if (idx >= 0) eventsArr[idx] = nextBlock;
  else eventsArr.push(nextBlock);

  const now = new Date();
  await prisma.competitionStartListSnapshot.update({
    where: { competitionId: COMPETITION_ID },
    data: {
      data: {
        ...raw,
        version: typeof raw.version === "number" ? raw.version : 2,
        capturedAt: now.toISOString(),
        events: eventsArr,
      },
      capturedAt: now,
    },
  });
  console.log("\n[execute] U15女子ビーチフラッグス HEAT 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
