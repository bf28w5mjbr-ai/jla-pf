/**
 * 指定大会・指定種目のスタートリストスナップショットだけを、現在のエントリーから再生成する（エントリー数はそのまま）。
 * 他種目のスナップショット JSON は変更しない。
 *
 * デフォルト種目名は IRON WOMAN（Yuigahama IRON の一般的なローカル名）。
 * `pnpm seed:potato-ocean-woman` 直後は種目が OCEAN WOMAN のため --event-name=OCEAN WOMAN を付ける。
 *
 * Usage:
 *   pnpm reset:start-list:event
 *   pnpm reset:start-list:event -- --dry-run
 *   pnpm reset:start-list:event -- --event-name="IRON WOMAN"
 *   pnpm reset:start-list:event -- --clear-dayops   # 当該種目の召集状態・ヒート締切行も削除
 *   pnpm reset:start-list:event -- --clear-results # OfficialResult（全ラウンド）・リザルト下書きを削除
 */
import { prisma } from "@/server/db";
import { buildStartListSnapshotPayload } from "@/lib/startListSnapshot";

const DEFAULT_COMPETITION_NAME = "POTATO CHALLENGE Yuigahama IRON";
const DEFAULT_EVENT_NAME = "IRON WOMAN";

function parseArgs() {
  const argv = process.argv.slice(2);
  let competitionName = DEFAULT_COMPETITION_NAME;
  let eventName = DEFAULT_EVENT_NAME;
  let dryRun = false;
  let clearDayops = false;
  let clearResults = false;
  for (const a of argv) {
    if (a === "--") continue;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--clear-dayops") clearDayops = true;
    else if (a === "--clear-results") clearResults = true;
    else if (a.startsWith("--competition-name="))
      competitionName = a.slice("--competition-name=".length).trim() || competitionName;
    else if (a.startsWith("--event-name="))
      eventName = a.slice("--event-name=".length).trim() || eventName;
  }
  return { competitionName, eventName, dryRun, clearDayops, clearResults };
}

async function main() {
  const { competitionName, eventName, dryRun, clearDayops, clearResults } = parseArgs();

  const competition = await prisma.competition.findFirst({
    where: { name: competitionName },
    select: { id: true, name: true },
  });
  if (!competition) {
    console.error(`大会が見つかりません: ${competitionName}`);
    process.exit(1);
  }

  const event = await prisma.event.findFirst({
    where: { competitionId: competition.id, name: eventName },
    select: { id: true, name: true },
  });
  if (!event) {
    const names = await prisma.event.findMany({
      where: { competitionId: competition.id },
      select: { name: true },
      orderBy: { displayOrder: "asc" },
    });
    console.error(`種目が見つかりません: ${eventName}`);
    console.error(
      `この大会の種目: ${names.map((e) => e.name).join(", ") || "(なし)"}`
    );
    process.exit(1);
  }

  const freshFull = await buildStartListSnapshotPayload(competition.id, "RECORD_CAPTURE");
  const freshBlock = freshFull.events.find((e) => e.eventId === event.id);
  if (!freshBlock) {
    console.error("再生成ペイロードに当該種目が含まれません（エントリー条件を確認）");
    process.exit(1);
  }

  const headHeat = freshBlock.rounds?.[0];
  const participantTotal =
    headHeat?.heats?.reduce(
      (sum, h) => sum + (Array.isArray(h.participants) ? h.participants.length : 0),
      0
    ) ?? 0;

  console.log(`大会: ${competition.name} (${competition.id})`);
  console.log(`種目: ${event.name} (${event.id})`);
  console.log(`再生成後の先頭ラウンド参加者数（スナップショット）: ${participantTotal}`);

  if (dryRun) {
    console.log("[dry-run] DB は更新しません。");
    await prisma.$disconnect();
    return;
  }

  if (clearResults) {
    const [official, drafts] = await Promise.all([
      prisma.officialResult.deleteMany({
        where: { competitionId: competition.id, eventId: event.id },
      }),
      prisma.competitionResultDraft.deleteMany({
        where: { competitionId: competition.id, eventId: event.id },
      }),
    ]);
    console.log(
      `リザルトクリア: OfficialResult ${official.count} 件（行・ヒート確定はカスケード削除）, CompetitionResultDraft ${drafts.count} 件`
    );
  }

  if (clearDayops) {
    const [st, mh] = await Promise.all([
      prisma.competitionParticipantStatus.deleteMany({
        where: { competitionId: competition.id, eventId: event.id },
      }),
      prisma.competitionHeatMarshalState.deleteMany({
        where: { competitionId: competition.id, eventId: event.id },
      }),
    ]);
    console.log(
      `dayops クリア: CompetitionParticipantStatus ${st.count} 件, HeatMarshalState ${mh.count} 件`
    );
  }

  const existing = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: competition.id },
    select: { id: true, data: true },
  });

  const now = new Date();

  if (!existing) {
    await prisma.competitionStartListSnapshot.create({
      data: {
        competitionId: competition.id,
        data: freshFull as object,
        capturedAt: now,
        createdByUserId: null,
      },
    });
    console.log("スナップショットが無かったため、大会全体を新規作成しました。");
    await prisma.$disconnect();
    return;
  }

  const prev = existing.data;
  if (!prev || typeof prev !== "object" || Array.isArray(prev)) {
    console.error("既存スナップショット data が不正です。手動で確認してください。");
    process.exit(1);
  }

  const base = prev as { version?: number; capturedAt?: string; events?: unknown[] };
  const events = Array.isArray(base.events) ? [...base.events] : [];
  const idx = events.findIndex(
    (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === event.id
  );

  const nextBlock = { ...freshBlock };
  if (idx >= 0) {
    events[idx] = nextBlock;
  } else {
    events.push(nextBlock);
  }

  const nextData = {
    ...base,
    version: typeof base.version === "number" ? base.version : 1,
    capturedAt: now.toISOString(),
    events,
  };

  await prisma.competitionStartListSnapshot.update({
    where: { competitionId: competition.id },
    data: {
      data: nextData as object,
      capturedAt: now,
    },
  });

  console.log("スナップショットを更新しました（当該種目のみ差し替え・先頭ラのみ・次ラ以降は削除済み）。");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
