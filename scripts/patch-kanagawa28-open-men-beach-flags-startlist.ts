/**
 * オープン男子ビーチフラッグス: 印刷スタートリスト（2026/5/31 0:58）の HEAT/レーンに合わせる
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-men-beach-flags-startlist.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-men-beach-flags-startlist.ts --execute
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

const TARGET_PLACEMENT: readonly { heat: number; names: readonly string[] }[] = [
  {
    heat: 1,
    names: [
      "阿部 大輝",
      "清水 琉之介",
      "伊藤 大槻",
      "岸 瑛心",
      "長瀬 立嗣",
      "鵜澤 優樹",
      "江頭 孝祐",
      "船山 暖",
      "岩井 義道",
      "竹田 光希",
      "香味 賢",
    ],
  },
  {
    heat: 2,
    names: [
      "植田 健太",
      "宮本 幸生",
      "深澤 健太",
      "堤 英介",
      "田中 改也",
      "田中 琳大",
      "柴崎 太一",
      "坂口 惇太",
      "堀江 星河",
      "三木 優人",
      "新井 圭",
    ],
  },
  {
    heat: 3,
    names: [
      "木村 将人",
      "伏本 幹太",
      "堀澤 大騎",
      "池田 圭汰",
      "石橋 知大",
      "高村 健登",
      "小出水 孝龍",
      "高松 夏一",
      "男沢 壮真",
      "江川 隼冬",
      "坂本 暉峻",
    ],
  },
  {
    heat: 4,
    names: [
      "藤ヶ森 翔琉",
      "一寸木 健太",
      "倉田 征士",
      "野口 勝成",
      "藤高 侑大",
      "山本 颯大",
      "染谷 嗣平",
      "梅澤 倫太朗",
      "赤川 慶",
      "大山 泰征",
    ],
  },
  {
    heat: 5,
    names: [
      "橋本 竜馬",
      "和田 賢一",
      "鐘ヶ江 勇利",
      "坂本 真徳",
      "清水 孝太朗",
      "小堀 湊一朗",
      "森下 広大",
      "西口 昇吾",
      "鈴木 直輝",
      "近藤 毅歩",
    ],
  },
  {
    heat: 6,
    names: [
      "薗田 善弘",
      "布井 蓮",
      "蔵田 遼",
      "小川 慶生",
      "北田 尚輝",
      "山口 唯継",
      "蓮沼 未洋",
      "粕谷島 迅斗",
      "大田 元斗",
      "斎藤 優心",
    ],
  },
];

/** 印刷物表記 → DB 登録名 */
const PRINT_NAME_ALIASES: Record<string, string> = {
  "伊藤 大槻": "伊藤 大晟",
  "鵜澤 優樹": "嶋津 俊哉",
  "江頭 孝祐": "江邨 孝祐",
  "香味 賢": "香味 翼",
  "植田 健太": "福田 健太",
  "堤 英介": "堀　 英介",
  "田中 改也": "田中 政也",
  "田中 琳大": "田中 慈大",
  "柴崎 太一": "柴﨑 太一",
  "坂口 惇太": "坂口 倖太",
  "堀江 星河": "堀江 星冴",
  "木村 将人": "木村 啓人",
  "伏本 幹太": "秋本 幹太",
  "堀澤 大騎": "塩澤 大騎",
  "高村 健登": "髙村 健登",
  "坂本 暉峻": "坂本 暉綺",
  "染谷 嗣平": "染谷 騎平",
  "薗田 善弘": "薗田 貴弘",
  "布井 蓮": "布井 漣",
  "山口 唯継": "山口 唯織",
  "粕谷島 迅斗": "美谷島 遥斗",
};

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

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

async function findEventId(): Promise<string> {
  const event = await prisma.event.findFirst({
    where: {
      competitionId: COMPETITION_ID,
      sex: "MALE",
      name: { contains: "オープンビーチフラッグ" },
    },
    select: { id: true, name: true },
  });
  if (!event) {
    console.error("オープン男子ビーチフラッグス種目が見つかりません");
    process.exit(1);
  }
  console.log("event:", event.id, event.name);
  return event.id;
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
      console.log(`  heat ${block.heat} lane ${participants.length}: ${name} → ${p.name}`);
    }
    heats.push({ heatIndex: block.heat, participants });
  }

  if (missing.length > 0) {
    console.error("\nエントリーが見つからない選手:", missing);
    for (const m of missing) {
      const family = m.split(/\s+/)[0];
      const hits = [...byName.keys()].filter((n) => n.includes(family));
      if (hits.length) console.error(`  ${m} → 候補: ${hits.join(", ")}`);
    }
    process.exit(1);
  }

  const used = new Set(heats.flatMap((h) => h.participants.map((p) => p.entryId)));
  const extra = [...byName.values()].filter((p) => !used.has(p.entryId));
  if (extra.length > 0) {
    console.warn("\n印刷に無い DB エントリー:", extra.map((p) => p.name).join(", "));
  }
  if (targetNames.length !== byName.size) {
    console.warn(`人数: 印刷 ${targetNames.length} / DB ${byName.size}`);
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

  if (dryRun) return;

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
  console.log("\n[execute] オープン男子ビーチフラッグス HEAT 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
