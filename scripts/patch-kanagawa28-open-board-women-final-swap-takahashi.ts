/**
 * 第28回神奈川：オープンボードレース（女子）決勝 L1 を
 * 高橋 陽（湯河原）→ 髙橋 若菜（南伊豆）に差し替え。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final-swap-takahashi.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final-swap-takahashi.ts --execute
 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0005jr04atytm9jr";

const WRONG_ENTRY_ID = "cmowq5ei60010la04vpszcmot"; // 高橋 陽（湯河原）
const CORRECT_ENTRY_ID = "cmojmr0kw0005l204jcwrcadw"; // 髙橋 若菜（南伊豆）

const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function main() {
  console.log(dryRun ? "[dry-run]" : "[execute]");

  const [wrongEntry, correctEntry] = await Promise.all([
    prisma.competitionEntry.findUnique({
      where: { id: WRONG_ENTRY_ID },
      select: {
        id: true,
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
        club: { select: { name: true } },
      },
    }),
    prisma.competitionEntry.findUnique({
      where: { id: CORRECT_ENTRY_ID },
      select: {
        id: true,
        userId: true,
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
        club: { select: { id: true, name: true } },
      },
    }),
  ]);

  if (!wrongEntry || !correctEntry) {
    console.error("エントリーが見つかりません");
    process.exit(1);
  }

  const wrongName = `${wrongEntry.user.profile?.familyName} ${wrongEntry.user.profile?.givenName}`;
  const correctName = `${correctEntry.user.profile?.familyName} ${correctEntry.user.profile?.givenName}`;
  console.log(`差し替え: ${wrongName} (${wrongEntry.club?.name}) → ${correctName} (${correctEntry.club?.name})`);

  const snapshot = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { id: true, data: true },
  });
  if (!snapshot?.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  const rounds = extractFrozenRoundsForEventFromSnapshotData(snapshot.data, EVENT_ID);
  const finalRound = rounds?.find((r) => r.round === "FINAL");
  if (!finalRound?.heats[0]) {
    console.error("FINAL ラウンドがありません");
    process.exit(1);
  }

  const participants = finalRound.heats[0].participants;
  const l1 = participants[0];
  if (!l1 || l1.kind !== "INDIVIDUAL" || l1.entryId !== WRONG_ENTRY_ID) {
    console.error("L1 が想定と異なります:", l1?.kind === "INDIVIDUAL" ? `${l1.name} (${l1.entryId})` : l1);
    process.exit(1);
  }

  console.log("スナップショット L1:", l1.name, l1.clubName);

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        round: "FINAL",
      },
    },
    select: {
      id: true,
      lockedAt: true,
      rows: {
        where: { lane: 1 },
        select: { id: true, competitionEntryId: true, rank: true, status: true },
      },
    },
  });

  if (official?.lockedAt) {
    console.error("OfficialResult FINAL はロック済みです");
    process.exit(1);
  }

  const l1Row = official?.rows[0];
  if (l1Row && l1Row.competitionEntryId !== WRONG_ENTRY_ID) {
    console.error("OfficialResult L1 が想定と異なります:", l1Row.competitionEntryId);
    process.exit(1);
  }
  console.log("OfficialResult L1:", l1Row ? `rank=${l1Row.rank} ${l1Row.status}` : "なし");

  if (dryRun) return;

  const raw = snapshot.data as { version?: number; capturedAt?: string; events?: unknown[] };
  const events = Array.isArray(raw.events) ? [...raw.events] : [];
  const idx = events.findIndex(
    (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === EVENT_ID
  );
  if (idx < 0) {
    console.error("スナップショットに種目ブロックがありません");
    process.exit(1);
  }

  const block = events[idx] as { rounds?: typeof rounds };
  const updatedRounds = (block.rounds ?? []).map((r) => {
    if (r.round !== "FINAL") return r;
    return {
      ...r,
      heats: r.heats.map((h) => {
        if (h.heatIndex !== 1) return h;
        return {
          ...h,
          participants: h.participants.map((p, i) => {
            if (i !== 0 || p.kind !== "INDIVIDUAL") return p;
            return {
              kind: "INDIVIDUAL" as const,
              entryId: CORRECT_ENTRY_ID,
              userId: correctEntry.userId,
              name: correctName,
              clubId: correctEntry.club?.id ?? null,
              clubName: correctEntry.club?.name ?? null,
            };
          }),
        };
      }),
    };
  });

  const now = new Date();
  events[idx] = { ...block, rounds: updatedRounds };

  await prisma.competitionStartListSnapshot.update({
    where: { competitionId: COMPETITION_ID },
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

  if (l1Row) {
    await prisma.officialResultRow.update({
      where: { id: l1Row.id },
      data: { competitionEntryId: CORRECT_ENTRY_ID },
    });
  }

  console.log("\n[execute] 決勝 L1 を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
