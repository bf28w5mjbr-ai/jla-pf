/**
 * U18男子ビーチフラッグス: 準決勝（SEMI）スタートリストを指定どおりに更新
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-men-beach-flags-semi-startlist.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u18-men-beach-flags-semi-startlist.ts --execute
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

/** 印刷物どおり（ヒート → レーン順の姓） */
const TARGET_PLACEMENT: readonly { heat: number; familyNames: readonly string[] }[] = [
  {
    heat: 1,
    familyNames: ["新井", "江渕", "米林", "井上", "片桐", "鍋田"],
  },
  {
    heat: 2,
    familyNames: ["狩野", "長谷川", "ドハティ", "中島", "伊藤", "古川"],
  },
];

/** 姓のみ表記 → DB 登録名（同姓複数の解決） */
const FAMILY_NAME_RESOLVE: Record<string, string> = {
  新井: "新井 嵯将",
  江渕: "江渕 匡祐",
  米林: "米林 志",
  井上: "井上 大地",
  片桐: "片桐 稜馬",
  鍋田: "鍋田 流風",
  狩野: "狩野 拓真",
  長谷川: "長谷川 澪",
  ドハティ: "ドハティ 友太朗",
  中島: "中島 颯汰",
  伊藤: "伊藤 一希",
  古川: "古川 遊楽",
};

const execute = process.argv.includes("--execute");
const dryRun = !execute;

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
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

function resolveParticipant(
  familyName: string,
  byName: Map<string, StartListParticipant>
): StartListParticipant | null {
  const full = FAMILY_NAME_RESOLVE[familyName];
  if (!full) return null;
  return byName.get(normalizeName(full)) ?? null;
}

async function main() {
  const eventId = EVENT_ID;
  const byName = await loadEntryByName(eventId);

  const snapRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  if (!snapRow?.data) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  const beforeRounds = extractFrozenRoundsForEventFromSnapshotData(snapRow.data, eventId);
  const currentSemi = beforeRounds?.find((r) => r.round === "SEMI");
  if (!currentSemi) {
    console.error("SEMI ラウンドがありません");
    process.exit(1);
  }

  const sourceMetaByEntry = new Map<
    string,
    Pick<StartListParticipant, "sourceHeat" | "sourceRank">
  >();
  for (const h of currentSemi.heats) {
    for (const p of h.participants) {
      if (p.kind !== "INDIVIDUAL") continue;
      sourceMetaByEntry.set(p.entryId, {
        sourceHeat: p.sourceHeat,
        sourceRank: p.sourceRank,
      });
    }
  }

  console.log(`event: ${eventId}`);
  console.log(
    "before semi:",
    currentSemi.heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );

  const missing: string[] = [];
  const heats: StartListHeat[] = [];

  for (const block of TARGET_PLACEMENT) {
    const participants: StartListParticipant[] = [];
    for (const familyName of block.familyNames) {
      const p = resolveParticipant(familyName, byName);
      if (!p) {
        missing.push(familyName);
        continue;
      }
      const meta = sourceMetaByEntry.get(p.entryId);
      participants.push({
        ...p,
        sourceHeat: meta?.sourceHeat ?? p.sourceHeat,
        sourceRank: meta?.sourceRank ?? p.sourceRank,
      });
      console.log(
        `  heat ${block.heat} lane ${participants.length}: ${familyName} → ${p.name} (${p.clubName})`
      );
    }
    heats.push({ heatIndex: block.heat, participants });
  }

  if (missing.length > 0) {
    console.error("\nエントリーが見つからない選手:", missing);
    process.exit(1);
  }

  console.log(
    "after semi:",
    heats.map((h) => `${h.heatIndex}(${h.participants.length})`).join(", ")
  );

  const heatRound = beforeRounds?.find((r) => r.round === "HEAT");
  const newSemiRound: StartListRoundData = {
    ...currentSemi,
    generatedAt: new Date().toISOString(),
    generatedBy: currentSemi.generatedBy ?? "RECORD_CAPTURE",
    heats,
  };
  const nextRounds = reorderRounds([
    ...(heatRound ? [heatRound] : []),
    newSemiRound,
    ...(beforeRounds ?? []).filter((r) => r.round !== "HEAT" && r.round !== "SEMI"),
  ]);

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
  console.log("\n[execute] U18男子ビーチフラッグス SEMI 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
