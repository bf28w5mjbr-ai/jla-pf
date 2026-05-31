/** ビーチフラッグス: 各 capturedAt 候補での HEAT 割当比較 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  buildDispersedIndividualParticipantHeats,
  computePlacementSeed,
  createStartListRng,
  type RankedStartListIndividual,
} from "@/lib/startListHeatPlacement";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
  resolveTabMaxLanes,
  roundTabToHeatSetting,
} from "@/lib/startListSettings";
import { enforceMinHeatCountForMaxLanes, resolveHeatCount } from "@/lib/startListRounds";
import { prisma } from "@/server/db";

const COMP = "cmnugqbxx000gjs04y449vpnv";
const CANDIDATES = [
  "2026-05-30T07:49:02.764Z",
  "2026-05-30T07:09:58.138Z",
  "2026-05-30T01:27:40.262Z",
];

async function main() {
  const ev = await prisma.event.findFirst({
    where: { competitionId: COMP, name: { contains: "オープンビーチフラッグ" }, sex: "MALE" },
    select: { id: true, name: true, preliminaryHeatLaneCount: true },
  });
  if (!ev) return;

  const comp = await prisma.competition.findUnique({
    where: { id: COMP },
    select: { startListSettings: true },
  });
  const { eventSettings } = parseStartListSettings(comp?.startListSettings ?? null);

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: COMP,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId: ev.id } },
    },
    include: {
      user: { select: { id: true, profile: { select: { familyName: true, givenName: true } } } },
      items: { select: { eventId: true } },
      participantStatuses: { select: { eventId: true, status: true, reason: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const individuals: RankedStartListIndividual[] = [];
  for (const entry of entries) {
    if (!entry.items.some((i) => i.eventId === ev.id)) continue;
    if (hasIndividualWithdrawalForEvent(entry.participantStatuses, ev.id)) continue;
    individuals.push({
      entryId: entry.id,
      userId: entry.user.id,
      name: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
      clubId: null as string | null,
      clubName: null as string | null,
      rank: null,
    });
  }

  const roundTabs = normalizeRoundTabs(eventSettings[ev.id] ?? {});
  const firstTab = roundTabs[0];
  const heatCount = enforceMinHeatCountForMaxLanes(
    individuals.length,
    resolveHeatCount(
      individuals.length,
      firstTab ? roundTabToHeatSetting(firstTab) : primaryHeatSettingFromEventConfig(eventSettings[ev.id])
    ),
    resolveTabMaxLanes(firstTab, ev.preliminaryHeatLaneCount)
  );
  const sortedIds = individuals.map((i) => i.entryId).sort().join(",");

  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMP },
    select: { data: true },
  });
  const cur = extractFrozenRoundsForEventFromSnapshotData(snap!.data, ev.id)?.find((r) => r.round === "HEAT");
  console.log("event", ev.name, "participants", individuals.length, "heats", heatCount);
  console.log("snapshot generatedAt", cur?.generatedAt);
  console.log("snapshot heat1 lane1-3:", cur?.heats[0]?.participants.slice(0, 3).map((p) => p.kind === "INDIVIDUAL" ? p.name : "?"));

  for (const capturedAt of CANDIDATES) {
    const seed = computePlacementSeed(COMP, ev.id, `${capturedAt}:${sortedIds}`);
    const rng = createStartListRng((seed ^ 1 * 0x9e37_79b9) >>> 0);
    const heats = buildDispersedIndividualParticipantHeats({
      individuals,
      heatCount,
      tabIndex: 0,
      officialRanksByRound: null,
      rng,
    });
    console.log(
      `\n${capturedAt} heat1 lane1-3:`,
      heats[0]?.participants.slice(0, 3).map((p) => (p.kind === "INDIVIDUAL" ? p.name : "?"))
    );
  }
}

main().finally(() => prisma.$disconnect());
