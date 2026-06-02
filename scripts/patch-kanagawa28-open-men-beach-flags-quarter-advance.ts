/**
 * オープン男子ビーチフラッグス: quarter（HEAT）各ヒートのアップ数を 4 に固定
 *
 * semi を 3 ヒート × 8 レーン（定員 24）に揃え、6 ヒート × 4 名 = 24 となるよう設定する。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-men-beach-flags-quarter-advance.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-men-beach-flags-quarter-advance.ts --execute
 */
import {
  computeLiveAdvanceQuotasForFrozenNonFinalTab,
  extractFrozenRoundsForEventFromSnapshotData,
} from "@/lib/startListEventTabDisplay";
import {
  buildStartListSettingsPayload,
  normalizeRoundTabs,
  parseStartListSettings,
} from "@/lib/startListSettings";
import { reorderRounds, type StartListRoundData } from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const TARGET_QUOTA = 4;
const SEMI_HEAT_COUNT = "3";
const SEMI_MAX_LANES = 8;

const execute = process.argv.includes("--execute");
const dryRun = !execute;

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

function patchRoundTabs(
  eventId: string,
  eventSettings: ReturnType<typeof parseStartListSettings>["eventSettings"]
) {
  const current = eventSettings[eventId] ?? {};
  const tabs = normalizeRoundTabs(current);
  if (tabs.length < 3) {
    console.error("roundTabs が 3 未満です");
    process.exit(1);
  }
  const [quarter, semi, finalTab] = tabs;
  const nextTabs = [
    quarter,
    {
      ...semi,
      label: semi.label || "semi",
      mode: "count" as const,
      heatCount: SEMI_HEAT_COUNT,
      heatSize: "",
      maxLanesPerHeat: SEMI_MAX_LANES,
    },
    finalTab,
  ];
  return {
    ...eventSettings,
    [eventId]: {
      ...current,
      roundTabs: nextTabs,
      progressionHeatCounts: [Number(SEMI_HEAT_COUNT), Number(finalTab.heatCount || "1")],
    },
  };
}

async function main() {
  const eventId = await findEventId();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { preliminaryHeatLaneCount: true, startListHeatPlanConfirmedAt: true },
  });
  if (!event?.startListHeatPlanConfirmedAt) {
    console.error("ヒート割当ステップ1が未確定です");
    process.exit(1);
  }

  const competition = await prisma.competition.findUnique({
    where: { id: COMPETITION_ID },
    select: { startListSettings: true },
  });
  const parsed = parseStartListSettings(competition?.startListSettings ?? null);
  const nextEventSettings = patchRoundTabs(eventId, parsed.eventSettings);
  const nextTabs = normalizeRoundTabs(nextEventSettings[eventId] ?? {});
  console.log(
    "semi tab:",
    nextTabs[1]?.heatCount,
    "heats ×",
    nextTabs[1]?.maxLanesPerHeat,
    "lanes"
  );

  const snapRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { data: true },
  });
  if (!snapRow?.data) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  const beforeRounds = extractFrozenRoundsForEventFromSnapshotData(snapRow.data, eventId);
  const heatRound = beforeRounds?.find((r) => r.round === "HEAT");
  if (!heatRound) {
    console.error("HEAT ラウンドがありません");
    process.exit(1);
  }

  const heatSizes = heatRound.heats.map((h) => h.participants.length);
  const computed = computeLiveAdvanceQuotasForFrozenNonFinalTab({
    snapshotRound: "HEAT",
    tabIndex: 0,
    tabCount: nextTabs.length,
    heatSizes,
    totalParticipants: heatSizes.reduce((a, b) => a + b, 0),
    liveTabs: nextTabs,
    preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
    eventHeatSetting: nextEventSettings[eventId],
  });
  console.log("computed quotas:", computed);
  if (!computed?.every((q) => q === TARGET_QUOTA)) {
    console.error(`全ヒート ${TARGET_QUOTA} にならないため中止:`, computed);
    process.exit(1);
  }

  const advanceQuotasByOfficialHeat = heatRound.heats.map((h) => ({
    heat: h.heatIndex,
    quota: TARGET_QUOTA,
  }));
  console.log("advanceQuotasByOfficialHeat:", advanceQuotasByOfficialHeat);

  const newHeatRound: StartListRoundData = {
    ...heatRound,
    advanceQuotasByOfficialHeat,
  };
  const tailRounds = (beforeRounds ?? []).filter((r) => r.round !== "HEAT");
  const nextRounds = reorderRounds([newHeatRound, ...tailRounds]);

  if (dryRun) {
    console.log("\n[dry-run] 更新予定: startListSettings.semi + snapshot HEAT.advanceQuotas");
    return;
  }

  const payloadToSave = buildStartListSettingsPayload({
    eventSettings: nextEventSettings,
    teamAssignmentDeadline: parsed.teamAssignmentDeadline,
  });
  await prisma.competition.update({
    where: { id: COMPETITION_ID },
    data: { startListSettings: payloadToSave },
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
  const evMeta = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true, sex: true, type: true },
  });
  const nextBlock = {
    ...prevBlock,
    eventId,
    name: evMeta!.name,
    sex: evMeta!.sex,
    type: evMeta!.type,
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

  console.log("\n[execute] quarter 全ヒートのアップ数を 4 に設定しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
