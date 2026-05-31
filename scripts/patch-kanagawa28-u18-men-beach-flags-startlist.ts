/**
 * U18男子ビーチフラッグス: 印刷スタートリストの HEAT/レーンに合わせる
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-men-beach-flags-startlist.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-men-beach-flags-startlist.ts --execute
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
const EVENT_ID = "cmnuyd66z0006l404coecq0k4";

/** 印刷物どおり（ヒート → レーン順の氏名） */
const TARGET_PLACEMENT: readonly { heat: number; names: readonly string[] }[] = [
  {
    heat: 1,
    names: [
      "古川 遊楽",
      "横矢 翔",
      "福田 諒",
      "白倉 政宗",
      "伊藤 一希",
      "佐野 敬太",
      "大野 快",
      "西 夏祈",
      "狩野 拓真",
    ],
  },
  {
    heat: 2,
    names: [
      "小島 徠叶",
      "江渕 匡祐",
      "長谷川 陽",
      "今井 清史郎",
      "井上 瑛太",
      "井上 大地",
      "米林 志",
      "小野村 圭敏",
      "木﨑 晴仁",
    ],
  },
  {
    heat: 3,
    names: [
      "藤田 武史",
      "ドハティ 友太朗",
      "笹野 滉太",
      "越石 陽斗",
      "中島 颯汰",
      "海野 陽太郎",
      "長谷川 英侑",
      "武田 哲歩",
      "笹生 律樹",
    ],
  },
  {
    heat: 4,
    names: [
      "新井 峻将",
      "片桐 稜馬",
      "田畑 佑笑",
      "松村 心",
      "舘野 嵩治",
      "郷田 純一郎",
      "鶴田 流風",
      "谷 陽向",
    ],
  },
];

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 印刷物表記 → DB 登録名 */
const PRINT_NAME_ALIASES: Record<string, string> = {
  "長谷川 陽": "長谷川 澪",
  "笹野 滉太": "菅野 滉太",
  "新井 峻将": "新井 嵯将",
  "鶴田 流風": "鍋田 流風",
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
  const eventId = EVENT_ID;
  const byName = await loadEntryByName(eventId);

  const targetNames = TARGET_PLACEMENT.flatMap((h) => h.names);
  console.log(`event: ${eventId}`);
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
    for (const m of missing) {
      const family = m.split(/\s+/)[0];
      const hits = [...byName.keys()].filter((n) => n.includes(family));
      if (hits.length) console.error(`  ${m} → 候補: ${hits.join(", ")}`);
    }
    process.exit(1);
  }

  if (targetNames.length !== byName.size) {
    console.warn(`\n警告: 印刷 ${targetNames.length} 名 / DB ${byName.size} 名`);
    const used = new Set(heats.flatMap((h) => h.participants.map((p) => p.entryId)));
    const extra = [...byName.values()].filter((p) => !used.has(p.entryId));
    if (extra.length) {
      console.warn("DBのみ:", extra.map((p) => `${p.name} (${p.clubName})`).join(", "));
    }
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
  console.log("\n[execute] U18男子ビーチフラッグス HEAT 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
