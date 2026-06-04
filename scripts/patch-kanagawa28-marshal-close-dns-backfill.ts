/**
 * 第28回神奈川: マーシャル締切済みヒートで DNS 化漏れを一括修復。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-marshal-close-dns-backfill.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-marshal-close-dns-backfill.ts --execute
 */
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import {
  getHeatFromRoundData,
  getRoundDataFromSnapshot,
  marshalParticipantRefsForAutoDsq,
  resolveMarshalSlotInHeat,
  type MarshalParticipantRef,
} from "@/lib/heatMarshalFromSnapshot";
import { marshalStatusKeyFromParts } from "@/lib/dayOpsParticipantKeys";
import { MARSHAL_CLOSE_DNS_REASON } from "@/lib/marshalHeatCloseDns";
import { expandTeamMarshalRefsWithMembers } from "@/lib/teamMarshalExpand";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function main() {
  const [closedHeats, snapshot, statuses, officials, events, entries] = await Promise.all([
    prisma.competitionHeatMarshalState.findMany({
      where: { competitionId: COMPETITION_ID, callClosedAt: { not: null } },
      orderBy: [{ eventId: "asc" }, { round: "asc" }, { heatIndex: "asc" }],
      select: { eventId: true, round: true, heatIndex: true },
    }),
    loadStartListSnapshotPayload(COMPETITION_ID),
    prisma.competitionParticipantStatus.findMany({
      where: { competitionId: COMPETITION_ID },
      select: {
        id: true,
        eventId: true,
        marshalRound: true,
        participantType: true,
        competitionEntryId: true,
        teamEntryId: true,
        teamMemberUserId: true,
        status: true,
      },
    }),
    prisma.officialResult.findMany({
      where: { competitionId: COMPETITION_ID },
      select: {
        id: true,
        eventId: true,
        round: true,
        rows: {
          select: {
            id: true,
            heat: true,
            lane: true,
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
            rank: true,
            status: true,
          },
        },
      },
    }),
    prisma.event.findMany({
      where: { competitionId: COMPETITION_ID },
      select: { id: true, name: true, ageCategory: { select: { name: true } } },
    }),
    prisma.competitionEntry.findMany({
      where: { competitionId: COMPETITION_ID },
      select: {
        id: true,
        user: { select: { profile: { select: { familyName: true, givenName: true } } } },
      },
    }),
  ]);

  const eventNames = new Map(
    events.map((e) => [e.id, `${e.ageCategory?.name ?? ""} ${e.name}`.trim()])
  );
  const entryNames = new Map(
    entries.map((e) => {
      const p = e.user.profile;
      return [e.id, p ? `${p.familyName ?? ""} ${p.givenName ?? ""}`.trim() : e.id];
    })
  );

  const statusByScopeKey = new Map<string, (typeof statuses)[number]>();
  for (const s of statuses) {
    const key = marshalStatusKeyFromParts(
      s.participantType,
      s.competitionEntryId,
      s.teamEntryId,
      s.teamMemberUserId
    );
    if (!key) continue;
    statusByScopeKey.set(`${s.eventId}:${s.marshalRound}:${key}`, s);
  }

  const terminalCrossRound = new Set<string>();
  for (const s of statuses) {
    if (!["DNS", "WITHDRAWN", "DSQ", "DNF"].includes(s.status)) continue;
    const key = marshalStatusKeyFromParts(
      s.participantType,
      s.competitionEntryId,
      s.teamEntryId,
      s.teamMemberUserId
    );
    if (!key) continue;
    terminalCrossRound.add(`${s.eventId}:${key}`);
  }

  const officialByEventRound = new Map<string, (typeof officials)[number]>();
  for (const o of officials) {
    officialByEventRound.set(`${o.eventId}:${o.round}`, o);
  }

  type Planned = {
    eventId: string;
    eventName: string;
    round: ResultRound;
    heatIndex: number;
    lane: number;
    name: string;
    statusId: string | null;
    statusAction: "create" | "update";
    fromStatus: string;
    officialResultId: string | null;
    officialRowId: string | null;
    officialAction: "create" | "update" | "skip";
    ref: MarshalParticipantRef;
  };

  const planned: Planned[] = [];

  for (const h of closedHeats) {
    const roundData = getRoundDataFromSnapshot(snapshot, h.eventId, h.round);
    const heat = getHeatFromRoundData(roundData, h.heatIndex);
    if (!heat) continue;

    const refs = await expandTeamMarshalRefsWithMembers(
      prisma,
      marshalParticipantRefsForAutoDsq(roundData, h.heatIndex)
    );
    const official = officialByEventRound.get(`${h.eventId}:${h.round}`);

    for (const ref of refs) {
      const slot = resolveMarshalSlotInHeat(heat, ref);
      if (!slot) continue;

      const scopeKey = marshalStatusKeyFromParts(
        ref.participantType,
        ref.competitionEntryId,
        ref.teamEntryId,
        ref.teamMemberUserId
      );
      if (!scopeKey) continue;
      if (terminalCrossRound.has(`${h.eventId}:${scopeKey}`)) continue;

      const row = statusByScopeKey.get(`${h.eventId}:${h.round}:${scopeKey}`);
      const storedStatus = row?.status ?? "PENDING";
      if (["CALLED", "CHECKED_IN", "DNS", "WITHDRAWN", "DSQ", "DNF"].includes(storedStatus)) {
        continue;
      }

      const officialRef: MarshalParticipantRef =
        ref.participantType === "TEAM" && ref.teamEntryId
          ? { participantType: "TEAM", competitionEntryId: null, teamEntryId: ref.teamEntryId }
          : ref;

      const name =
        officialRef.participantType === "INDIVIDUAL" && officialRef.competitionEntryId
          ? entryNames.get(officialRef.competitionEntryId) ?? officialRef.competitionEntryId
          : officialRef.teamEntryId ?? "?";

      const officialRows = official?.rows.filter((r) => r.heat === h.heatIndex) ?? [];
      const okRow = officialRows.find((r) => {
        if (officialRef.participantType === "INDIVIDUAL") {
          return r.competitionEntryId === officialRef.competitionEntryId && r.status === "OK" && r.rank != null;
        }
        return r.teamEntryId === officialRef.teamEntryId && r.status === "OK" && r.rank != null;
      });
      const existingOfficial = officialRows.find((r) => {
        if (officialRef.participantType === "INDIVIDUAL") {
          return r.competitionEntryId === officialRef.competitionEntryId;
        }
        return r.teamEntryId === officialRef.teamEntryId;
      });

      let officialAction: Planned["officialAction"] = "skip";
      if (!okRow && official) {
        officialAction = existingOfficial ? "update" : "create";
      }

      planned.push({
        eventId: h.eventId,
        eventName: eventNames.get(h.eventId) ?? h.eventId,
        round: h.round,
        heatIndex: h.heatIndex,
        lane: slot.lane,
        name,
        statusId: row?.id ?? null,
        statusAction: row ? "update" : "create",
        fromStatus: storedStatus,
        officialResultId: official?.id ?? null,
        officialRowId: existingOfficial?.id ?? null,
        officialAction,
        ref,
      });
    }
  }

  const deduped = new Map<string, Planned>();
  for (const p of planned) {
    const statusKey = marshalStatusKeyFromParts(
      p.ref.participantType,
      p.ref.competitionEntryId,
      p.ref.teamEntryId,
      p.ref.teamMemberUserId
    );
    const dedupeKey = `${p.eventId}:${p.round}:${p.heatIndex}:${statusKey ?? p.name}`;
    if (!deduped.has(dedupeKey)) deduped.set(dedupeKey, p);
  }
  const uniquePlanned = [...deduped.values()];

  console.log(dryRun ? "[dry-run]" : "[execute]");
  console.log(`closed heats: ${closedHeats.length}`);
  console.log(`participant status fixes: ${uniquePlanned.length}`);
  console.log(`official DNS row fixes: ${uniquePlanned.filter((p) => p.officialAction !== "skip").length}`);

  for (const p of uniquePlanned) {
    console.log(
      `  ${p.eventName} ${p.round} heat${p.heatIndex} L${p.lane} ${p.name} status:${p.fromStatus}→DNS official:${p.officialAction}`
    );
  }

  if (dryRun || uniquePlanned.length === 0) return;

  const BATCH = 25;
  for (let i = 0; i < uniquePlanned.length; i += BATCH) {
    const batch = uniquePlanned.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const p of batch) {
          if (p.statusAction === "update" && p.statusId) {
            await tx.competitionParticipantStatus.update({
              where: { id: p.statusId },
              data: {
                status: "DNS",
                reason: MARSHAL_CLOSE_DNS_REASON,
                calledAt: null,
                updatedByUserId: null,
              },
            });
          } else {
            await tx.competitionParticipantStatus.create({
              data: {
                competitionId: COMPETITION_ID,
                eventId: p.eventId,
                participantType: p.ref.participantType,
                competitionEntryId: p.ref.competitionEntryId ?? null,
                teamEntryId: p.ref.teamEntryId ?? null,
                teamMemberUserId: p.ref.teamMemberUserId ?? null,
                marshalRound: p.round,
                status: "DNS",
                reason: MARSHAL_CLOSE_DNS_REASON,
                calledAt: null,
                updatedByUserId: null,
              },
            });
          }

          if (p.officialAction === "skip" || !p.officialResultId) continue;

          const officialData = {
            status: "DNS" as const,
            rank: null,
            advanceWithoutRank: false,
            heat: p.heatIndex,
            lane: p.lane,
            remarks: MARSHAL_CLOSE_DNS_REASON,
            tieGroup: null,
            unit: "OTHER" as const,
          };

          if (p.officialAction === "update" && p.officialRowId) {
            await tx.officialResultRow.update({
              where: { id: p.officialRowId },
              data: officialData,
            });
          } else {
            await tx.officialResultRow.create({
              data: {
                officialResultId: p.officialResultId,
                entryType: p.ref.participantType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM",
                competitionEntryId: p.ref.competitionEntryId,
                teamEntryId: p.ref.teamEntryId,
                ...officialData,
              },
            });
          }
        }
      },
      { timeout: 60_000 }
    );
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${batch.length} rows`);
  }

  console.log(`\n[execute] applied ${uniquePlanned.length} participant fixes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
