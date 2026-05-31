/** ビーチフラッグス: スナップショットと各 seed 候補の一致度 */
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  buildDispersedIndividualParticipantHeats,
  buildDispersedTeamParticipantHeats,
  computePlacementSeed,
  createStartListRng,
} from "@/lib/startListHeatPlacement";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
  resolveTabMaxLanes,
  roundTabToHeatSetting,
} from "@/lib/startListSettings";
import {
  enforceMinHeatCountForMaxLanes,
  resolveHeatCount,
  type StartListParticipant,
} from "@/lib/startListRounds";
import { formatAssignableTeamMemberNames } from "@/lib/teamMemberSlots";
import { prisma } from "@/server/db";

const COMP = "cmnugqbxx000gjs04y449vpnv";
const CANDIDATES = [
  "2026-05-30T07:49:02.764Z",
  "2026-05-30T07:09:58.138Z",
  "2026-05-30T07:07:59.650Z",
  "2026-05-30T01:27:40.262Z",
  "2026-05-30T01:25:15.179Z",
  "2026-05-30T01:18:52.223Z",
  "2026-05-30T01:18:08.028Z",
];

function slotKey(p: StartListParticipant) {
  return p.kind === "INDIVIDUAL" ? `I:${p.entryId}` : `T:${p.teamEntryId}`;
}

function mapRound(round: { heats: { heatIndex: number; participants: StartListParticipant[] }[] }) {
  const m = new Map<string, { heat: number; lane: number }>();
  for (const h of round.heats) {
    h.participants.forEach((p, i) => m.set(slotKey(p), { heat: h.heatIndex, lane: i + 1 }));
  }
  return m;
}

function diffCount(a: Map<string, { heat: number; lane: number }>, b: Map<string, { heat: number; lane: number }>) {
  let n = 0;
  for (const [k, v] of b) {
    const c = a.get(k);
    if (!c || c.heat !== v.heat || c.lane !== v.lane) n++;
  }
  return n;
}

async function loadParticipants(eventId: string, type: "INDIVIDUAL" | "TEAM") {
  if (type === "TEAM") {
    const teams = await prisma.teamEntry.findMany({
      where: { competitionId: COMP, eventId },
      include: {
        club: { select: { id: true, name: true } },
        members: {
          select: { role: true, user: { select: { profile: { select: { familyName: true, givenName: true } } } } },
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
      competitionId: COMP,
      status: "SUBMITTED",
      ...competitionEntryEligibleForStartListWhere,
      items: { some: { eventId } },
    },
    include: {
      user: { select: { id: true, profile: { select: { familyName: true, givenName: true } } } },
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

function buildHeat(
  eventId: string,
  type: "INDIVIDUAL" | "TEAM",
  participants: StartListParticipant[],
  eventSettings: ReturnType<typeof parseStartListSettings>["eventSettings"],
  laneCount: number | null,
  capturedAt: string
) {
  const roundTabs = normalizeRoundTabs(eventSettings[eventId] ?? {});
  const firstTab = roundTabs[0];
  const n = participants.length;
  const heatCount = enforceMinHeatCountForMaxLanes(
    n,
    resolveHeatCount(
      n,
      firstTab ? roundTabToHeatSetting(firstTab) : primaryHeatSettingFromEventConfig(eventSettings[eventId])
    ),
    resolveTabMaxLanes(firstTab, laneCount)
  );
  const sortedIds =
    type === "TEAM"
      ? participants.filter((p) => p.kind === "TEAM").map((p) => p.teamEntryId).sort().join(",")
      : participants.filter((p) => p.kind === "INDIVIDUAL").map((p) => p.entryId).sort().join(",");
  const seed = computePlacementSeed(COMP, eventId, `${capturedAt}:${sortedIds}`);
  const rng = createStartListRng((seed ^ 1 * 0x9e37_79b9) >>> 0);
  if (type === "TEAM") {
    const teams = participants.filter((p) => p.kind === "TEAM").map((p) => ({
      teamEntryId: p.teamEntryId,
      teamName: p.teamName,
      clubId: p.clubId,
      clubName: p.clubName,
      members: p.members,
      rank: null,
    }));
    return buildDispersedTeamParticipantHeats({ teams, heatCount, tabIndex: 0, officialRanksByRound: null, rng });
  }
  const individuals = participants.filter((p) => p.kind === "INDIVIDUAL").map((p) => ({
    entryId: p.entryId,
    userId: p.userId,
    name: p.name,
    clubId: p.clubId,
    clubName: p.clubName,
    rank: null,
  }));
  return buildDispersedIndividualParticipantHeats({
    individuals,
    heatCount,
    tabIndex: 0,
    officialRanksByRound: null,
    rng,
  });
}

async function main() {
  const comp = await prisma.competition.findUnique({
    where: { id: COMP },
    select: { startListSettings: true },
  });
  const { eventSettings } = parseStartListSettings(comp?.startListSettings ?? null);
  const snap = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId: COMP },
    select: { data: true },
  });

  const events = await prisma.event.findMany({
    where: { competitionId: COMP, name: { contains: "ビーチフラッグ" } },
    select: { id: true, name: true, sex: true, type: true, preliminaryHeatLaneCount: true, ageCategory: { select: { name: true } } },
    orderBy: { displayOrder: "asc" },
  });

  for (const ev of events) {
    const curHeat = extractFrozenRoundsForEventFromSnapshotData(snap!.data, ev.id)?.find((r) => r.round === "HEAT");
    if (!curHeat) {
      console.log(ev.name, "no HEAT");
      continue;
    }
    const curMap = mapRound(curHeat);
    const participants = await loadParticipants(ev.id, ev.type);
    let best = { capturedAt: "?", diff: Infinity };
    for (const capturedAt of CANDIDATES) {
      const heats = buildHeat(ev.id, ev.type, participants, eventSettings, ev.preliminaryHeatLaneCount, capturedAt);
      const map = new Map<string, { heat: number; lane: number }>();
      for (const h of heats) {
        h.participants.forEach((p, i) => {
          map.set(
            p.kind === "INDIVIDUAL" ? `I:${p.entryId}` : `T:${p.teamEntryId}`,
            { heat: h.heatIndex, lane: i + 1 }
          );
        });
      }
      const d = diffCount(curMap, map);
      if (d < best.diff) best = { capturedAt, diff: d };
    }
    console.log(
      `${ev.sex} ${ev.ageCategory?.name} ${ev.name}: snapshot@${curHeat.generatedAt} best=${best.capturedAt} diff=${best.diff}/${curMap.size}`
    );
  }
}

main().finally(() => prisma.$disconnect());
