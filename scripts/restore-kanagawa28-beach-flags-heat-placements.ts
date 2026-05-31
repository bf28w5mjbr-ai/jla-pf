/**
 * 神奈川28: ビーチフラッグス種目の HEAT 割当を 5/30 18:00 JST 時点に復元
 * ラウンド設定は変更しない。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/restore-kanagawa28-beach-flags-heat-placements.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/restore-kanagawa28-beach-flags-heat-placements.ts --execute
 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  buildDispersedIndividualParticipantHeats,
  buildDispersedTeamParticipantHeats,
  computePlacementSeed,
  createStartListRng,
} from "@/lib/startListHeatPlacement";
import { loadScheduleRowPartitionForCompetition } from "@/lib/scheduleRowOrderServer";
import { dayKeyFromInstant } from "@/lib/competitionScheduleDays";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
  resolveTabMaxLanes,
  roundTabToHeatSetting,
} from "@/lib/startListSettings";
import {
  enforceMinHeatCountForMaxLanes,
  reorderRounds,
  resolveHeatCount,
  type StartListHeat,
  type StartListParticipant,
  type StartListRoundData,
} from "@/lib/startListRounds";
import { formatAssignableTeamMemberNames } from "@/lib/teamMemberSlots";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_NAME_FILTER = "ビーチフラッグ";
/** 2026年5月30日 18:00 JST（復元基準時刻） */
const RESTORE_CUTOFF_ISO = "2026-05-30T09:00:00.000Z";
/**
 * 18:00 JST より前の最後の朝一括保存（JST 10:27）。
 * 16:49 JST 保存でヒート分割が変わっていない種目の 18:00 時点の割当。
 * 16:49 版が必要な場合: --captured-at=2026-05-30T07:49:02.764Z
 */
const DEFAULT_CAPTURED_AT = "2026-05-30T01:27:40.262Z";

const execute = process.argv.includes("--execute");
const dryRun = !execute;
const forcedCapturedAt = process.argv.find((a) => a.startsWith("--captured-at="))?.slice("--captured-at=".length);

type SlotKey = string;

function slotKey(p: StartListParticipant): SlotKey {
  return p.kind === "INDIVIDUAL" ? `I:${p.entryId}` : `T:${p.teamEntryId}`;
}

function heatLaneMap(round: StartListRoundData | undefined): Map<SlotKey, { heat: number; lane: number }> {
  const map = new Map<SlotKey, { heat: number; lane: number }>();
  if (!round) return map;
  for (const h of round.heats) {
    h.participants.forEach((p, i) => {
      map.set(slotKey(p), { heat: h.heatIndex, lane: i + 1 });
    });
  }
  return map;
}

async function loadParticipantsForEvent(
  eventId: string,
  type: "INDIVIDUAL" | "TEAM"
): Promise<StartListParticipant[]> {
  if (type === "TEAM") {
    const teams = await prisma.teamEntry.findMany({
      where: { competitionId: COMPETITION_ID, eventId },
      include: {
        club: { select: { id: true, name: true } },
        members: {
          select: {
            role: true,
            user: { select: { profile: { select: { familyName: true, givenName: true } } } },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return teams.map((t) => ({
      kind: "TEAM" as const,
      teamEntryId: t.id,
      teamName: t.teamName,
      clubId: t.club?.id ?? null,
      clubName: t.club?.name ?? null,
      members: formatAssignableTeamMemberNames(t.members),
    }));
  }

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: COMPETITION_ID,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId } },
    },
    include: {
      user: {
        select: {
          id: true,
          profile: { select: { familyName: true, givenName: true } },
        },
      },
      club: { select: { id: true, name: true } },
      items: { select: { eventId: true } },
      participantStatuses: { select: { eventId: true, status: true, reason: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const out: StartListParticipant[] = [];
  for (const entry of entries) {
    if (!entry.items.some((i) => i.eventId === eventId)) continue;
    if (hasIndividualWithdrawalForEvent(entry.participantStatuses, eventId)) continue;
    out.push({
      kind: "INDIVIDUAL",
      entryId: entry.id,
      userId: entry.user.id,
      name: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
      clubId: entry.club?.id ?? null,
      clubName: entry.club?.name ?? null,
    });
  }
  return out;
}

function buildHeatRound(params: {
  eventId: string;
  type: "INDIVIDUAL" | "TEAM";
  participants: StartListParticipant[];
  eventSettings: ReturnType<typeof parseStartListSettings>["eventSettings"];
  preliminaryHeatLaneCount: number | null;
  capturedAt: string;
}): StartListRoundData {
  const { eventId, type, participants, eventSettings, preliminaryHeatLaneCount, capturedAt } =
    params;
  const roundTabs = normalizeRoundTabs(eventSettings[eventId] ?? {});
  const firstTab = roundTabs[0];
  const n = participants.length;
  const heatCountRaw = resolveHeatCount(
    n,
    firstTab
      ? roundTabToHeatSetting(firstTab)
      : primaryHeatSettingFromEventConfig(eventSettings[eventId])
  );
  const heatCount = enforceMinHeatCountForMaxLanes(
    n,
    heatCountRaw,
    resolveTabMaxLanes(firstTab, preliminaryHeatLaneCount)
  );
  const sortedIds =
    type === "TEAM"
      ? participants
          .filter((p): p is Extract<StartListParticipant, { kind: "TEAM" }> => p.kind === "TEAM")
          .map((p) => p.teamEntryId)
          .sort()
          .join(",")
      : participants
          .filter(
            (p): p is Extract<StartListParticipant, { kind: "INDIVIDUAL" }> =>
              p.kind === "INDIVIDUAL"
          )
          .map((p) => p.entryId)
          .sort()
          .join(",");
  const placementSeed = computePlacementSeed(
    COMPETITION_ID,
    eventId,
    `${capturedAt}:${sortedIds}`
  );
  const tabSeed = (placementSeed ^ 1 * 0x9e37_79b9) >>> 0;
  const rng = createStartListRng(tabSeed);

  let heats: StartListHeat[];
  if (type === "TEAM") {
    const teamRows = participants.filter(
      (p): p is Extract<StartListParticipant, { kind: "TEAM" }> => p.kind === "TEAM"
    );
    heats = buildDispersedTeamParticipantHeats({
      teams: teamRows.map((p) => ({
        teamEntryId: p.teamEntryId,
        teamName: p.teamName,
        clubId: p.clubId,
        clubName: p.clubName,
        members: p.members,
        rank: null,
      })),
      heatCount,
      tabIndex: 0,
      officialRanksByRound: null,
      rng,
    });
  } else {
    const indRows = participants.filter(
      (p): p is Extract<StartListParticipant, { kind: "INDIVIDUAL" }> => p.kind === "INDIVIDUAL"
    );
    heats = buildDispersedIndividualParticipantHeats({
      individuals: indRows.map((p) => ({
        entryId: p.entryId,
        userId: p.userId,
        name: p.name,
        clubId: p.clubId,
        clubName: p.clubName,
        rank: null,
      })),
      heatCount,
      tabIndex: 0,
      officialRanksByRound: null,
      rng,
    });
  }

  return {
    round: "HEAT",
    generatedAt: capturedAt,
    generatedBy: "RECORD_CAPTURE",
    heats,
  };
}

function resolveCapturedAtForEvent(_currentHeat: StartListRoundData | undefined): string {
  if (forcedCapturedAt) return forcedCapturedAt;
  return DEFAULT_CAPTURED_AT;
}

async function main() {
  const events = await prisma.event.findMany({
    where: {
      competitionId: COMPETITION_ID,
      name: { contains: EVENT_NAME_FILTER },
    },
    select: {
      id: true,
      name: true,
      sex: true,
      type: true,
      scheduledStartAt: true,
      preliminaryHeatLaneCount: true,
      ageCategory: { select: { name: true } },
    },
    orderBy: { displayOrder: "asc" },
  });

  if (events.length === 0) {
    console.error("ビーチフラッグス種目が見つかりません");
    process.exit(1);
  }

  const { competitionDayKeys } = await loadScheduleRowPartitionForCompetition(COMPETITION_ID);

  const competition = await prisma.competition.findUnique({
    where: { id: COMPETITION_ID },
    select: { startListSettings: true },
  });
  const settings = parseStartListSettings(competition?.startListSettings ?? null);

  const snapRow = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMPETITION_ID },
    select: { id: true, data: true, capturedAt: true },
  });
  if (!snapRow?.data) {
    console.error("スナップショットがありません");
    process.exit(1);
  }

  console.log(`restore cutoff: ${RESTORE_CUTOFF_ISO} (2026/5/30 18:00 JST)`);
  console.log(`target: ${EVENT_NAME_FILTER} (${events.length} 種目)`);
  console.log(`mode: ${dryRun ? "dry-run" : "execute"}`);
  console.log(`current snapshot capturedAt: ${snapRow.capturedAt.toISOString()}`);
  for (const e of events) {
    console.log(
      `  - ${e.sex} ${e.ageCategory?.name ?? "?"} ${e.name} (start ${dayKeyFromInstant(e.scheduledStartAt) ?? "?"})`
    );
  }

  const raw = snapRow.data as { version?: number; capturedAt?: string; events?: unknown[] };
  const eventsArr = Array.isArray(raw.events) ? [...raw.events] : [];

  let changedEvents = 0;
  let skippedEvents = 0;

  for (const ev of events) {
    const currentRounds = extractFrozenRoundsForEventFromSnapshotData(snapRow.data, ev.id);
    const currentHeat = currentRounds?.find((r) => r.round === "HEAT");
    const capturedAt = resolveCapturedAtForEvent(currentHeat);
    const participants = await loadParticipantsForEvent(ev.id, ev.type);
    if (participants.length === 0) {
      console.log(`\n[SKIP] ${ev.name}: HEAT 参加者なし`);
      skippedEvents += 1;
      continue;
    }

    const historicalHeat = buildHeatRound({
      eventId: ev.id,
      type: ev.type,
      participants,
      eventSettings: settings.eventSettings,
      preliminaryHeatLaneCount: ev.preliminaryHeatLaneCount,
      capturedAt,
    });

    const curMap = heatLaneMap(currentHeat);
    const histMap = heatLaneMap(historicalHeat);
    const sameKeys =
      curMap.size === histMap.size && [...histMap.keys()].every((k) => curMap.has(k));

    let diffCount = 0;
    if (sameKeys) {
      for (const [k, v] of histMap) {
        const c = curMap.get(k);
        if (!c || c.heat !== v.heat || c.lane !== v.lane) diffCount += 1;
      }
    }

    const label = `${ev.sex} ${ev.ageCategory?.name ?? "?"} ${ev.name}`;
    console.log(`\n${label} seed=${capturedAt} (prev generatedAt=${currentHeat?.generatedAt ?? "?"})`);

    if (!sameKeys) {
      console.log(`[SKIP] 参加者集合が一致しません (cur=${curMap.size}, hist=${histMap.size})`);
      skippedEvents += 1;
      continue;
    }
    if (diffCount === 0) {
      console.log("[OK] 変更なし");
      continue;
    }

    console.log(`[CHANGE] ${diffCount} 名のヒート/レーンが異なります`);
    changedEvents += 1;

    if (dryRun) {
      for (const [k, v] of histMap) {
        const c = curMap.get(k)!;
        if (c.heat !== v.heat || c.lane !== v.lane) {
          const name =
            k.startsWith("I:")
              ? participants.find((p) => p.kind === "INDIVIDUAL" && p.entryId === k.slice(2))?.name
              : participants.find((p) => p.kind === "TEAM" && p.teamEntryId === k.slice(2))?.teamName;
          console.log(`  ${name}: heat ${c.heat} lane ${c.lane} -> heat ${v.heat} lane ${v.lane}`);
        }
      }
      continue;
    }

    const tailRounds = (currentRounds ?? []).filter((r) => r.round !== "HEAT");
    const nextRounds = reorderRounds([historicalHeat, ...tailRounds]);
    const idx = eventsArr.findIndex(
      (e) => e && typeof e === "object" && (e as { eventId?: string }).eventId === ev.id
    );
    const prevBlock =
      idx >= 0 && eventsArr[idx] && typeof eventsArr[idx] === "object"
        ? (eventsArr[idx] as Record<string, unknown>)
        : {};
    const nextBlock = {
      ...prevBlock,
      eventId: ev.id,
      name: ev.name,
      sex: ev.sex,
      type: ev.type,
      rounds: nextRounds,
    };
    if (idx >= 0) eventsArr[idx] = nextBlock;
    else eventsArr.push(nextBlock);
  }

  console.log(
    `\n=== summary: changed=${changedEvents}, skipped=${skippedEvents}, unchanged=${events.length - changedEvents - skippedEvents}`
  );

  if (dryRun || changedEvents === 0) return;

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
  console.log("\n[execute] ビーチフラッグス HEAT 割当を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
