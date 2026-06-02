/**
 * オープン女子ビーチフラッグス: 印刷スタートリストの HEAT/レーンに合わせる
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-flags-startlist.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-women-beach-flags-startlist.ts --execute
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
const EVENT_ID = "cmnwtnhxi0007jr04rr1nfioq";

/** 印刷物どおり（ヒート → レーン順の氏名） */
const TARGET_PLACEMENT: readonly { heat: number; names: readonly string[] }[] = [
  {
    heat: 1,
    names: [
      "石塚 円香",
      "川又 彩乃",
      "佐藤 葵",
      "中山 渚",
      "横山 華子",
      "中島 星南",
      "植田 愛子",
      "荒木 菜月",
      "古川 穂波",
      "佐々木 奏",
    ],
  },
  {
    heat: 2,
    names: [
      "市川 さくら",
      "田 樹莉",
      "正木 友海",
      "矢上 結月",
      "渡邊 瑠奈",
      "八谷 倖愛",
      "石黒 七都",
      "三浦 梨奈",
      "佐野 涼楓",
    ],
  },
  {
    heat: 3,
    names: [
      "坂本 真心",
      "迫川 那瑠弥",
      "岸 愛姫",
      "赤坂 弥玲",
      "近本 ひなの",
      "田中 綾",
      "金坂 佳瑛",
      "飛内 美海",
      "後藤 美友",
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
  "渡邊 瑠奈": "渡邉 瑠奈",
  "迫川 那瑠弥": "追川 那瑠弥",
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
  console.log("\n[execute] オープン女子ビーチフラッグス HEAT 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
