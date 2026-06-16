import { cache } from "react";
import { prisma } from "@/server/db";
import { parseStartListSnapshotLooseForRoundRead } from "@/lib/heatMarshalFromSnapshot";
import { resolveTeamAssignmentDeadline } from "@/lib/startListSettings";
import { getTeamEntryMarshalAssignmentBlockedMap } from "@/lib/teamMemberAssignmentWindow";
import { competitionIdsForClubFromApprovedTechnicalOfficialApplications } from "@/lib/resolveTechnicalOfficialApplicationClub";
import {
  buildClubCompetitionRosterMap,
  type ClubCompetitionRosterParticipant,
} from "@/lib/clubCompetitionRoster";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";

export type ClubCompetitionTeamSummary = {
  id: string;
  name: string;
  startDate: Date;
  entryEndDate: Date | null;
  teamCount: number;
  assignmentOpen: boolean;
  assignmentDeadline: Date | null;
  allTeamsMarshalBlocked: boolean;
};

export type ClubCompetitionTabData = {
  competitionSectionCount: number;
  competitionRows: {
    competition: {
      id: string;
      name: string;
      venue: string | null;
      startDate: Date;
      entryStartDate: Date | null;
      entryEndDate: Date | null;
      startListSettings: unknown;
      status: string;
      officialRecruitmentEnabled: boolean | null;
      technicalOfficialRecruitmentEnabled: boolean | null;
      technicalOfficialTiers: unknown;
    };
    entries: { id: string; eventId: string }[];
  }[];
  competitionTeamSummaries: ClubCompetitionTeamSummary[];
  rosterByCompetitionId: Map<string, ClubCompetitionRosterParticipant[]>;
  summaryByCompetitionId: Map<string, ClubCompetitionTeamSummary>;
  technicalOfficialCompetitionIdSet: Set<string>;
  competitionIdsFromToOnly: Set<string>;
};

type ClubCompetitionLinkIds = {
  teamCompIds: { competitionId: string }[];
  individualCompIds: { competitionId: string }[];
  toAssignments: { competitionId: string }[];
  toInvitations: { competitionId: string }[];
};

async function loadClubCompetitionLinkIds(clubId: string): Promise<ClubCompetitionLinkIds> {
  const [teamCompIds, individualCompIds, toAssignments, toInvitations] = await Promise.all([
    prisma.teamEntry.findMany({
      where: { clubId },
      select: { competitionId: true },
      distinct: ["competitionId"],
    }),
    prisma.competitionEntry.findMany({
      where: { clubId, status: { not: "CANCELLED" } },
      select: { competitionId: true },
      distinct: ["competitionId"],
    }),
    prisma.competitionTechnicalOfficialAssignment.findMany({
      where: { clubId },
      select: { competitionId: true },
      distinct: ["competitionId"],
    }),
    prisma.competitionTechnicalOfficialInvitation.findMany({
      where: { clubId, status: "PENDING" },
      select: { competitionId: true },
      distinct: ["competitionId"],
    }),
  ]);
  return { teamCompIds, individualCompIds, toAssignments, toInvitations };
}

function unionCompetitionIdsFromLinks(
  linkIds: ClubCompetitionLinkIds,
  toAppCompetitionIds: string[] = []
): string[] {
  return [
    ...new Set([
      ...linkIds.teamCompIds.map((t) => t.competitionId),
      ...linkIds.individualCompIds.map((e) => e.competitionId),
      ...linkIds.toAssignments.map((r) => r.competitionId),
      ...linkIds.toInvitations.map((r) => r.competitionId),
      ...toAppCompetitionIds,
    ]),
  ];
}

async function countEligibleCompetitions(candidateCompetitionIds: string[]): Promise<number> {
  if (candidateCompetitionIds.length === 0) return 0;
  return prisma.competition.count({
    where: { id: { in: candidateCompetitionIds } },
  });
}

/** ヘッダー・タブバッジ用（TO 公式応募の名前解決をスキップ） */
export const loadClubCompetitionSectionCountFast = cache(
  async (clubId: string): Promise<number> => {
    const linkIds = await loadClubCompetitionLinkIds(clubId);
    return countEligibleCompetitions(unionCompetitionIdsFromLinks(linkIds));
  }
);

/** TO 公式応募を含む完全な参加大会数 */
export const loadClubCompetitionSectionCountFull = cache(
  async (clubId: string, clubName: string): Promise<number> => {
    const [linkIds, toAppCompetitionIds] = await Promise.all([
      loadClubCompetitionLinkIds(clubId),
      competitionIdsForClubFromApprovedTechnicalOfficialApplications(prisma, clubId, clubName),
    ]);
    return countEligibleCompetitions(
      unionCompetitionIdsFromLinks(linkIds, toAppCompetitionIds)
    );
  }
);

/** @deprecated loadClubCompetitionSectionCountFast / Full を使用 */
export const loadClubCompetitionSectionCount = loadClubCompetitionSectionCountFull;

function buildClosedMarshalHeatKeySet(
  rows: { eventId: string; round: string; heatIndex: number }[],
  eventIds: Iterable<string>
): Set<string> {
  const allowedEventIds = new Set(eventIds);
  return new Set(
    rows
      .filter((r) => allowedEventIds.has(r.eventId))
      .map((r) => `${r.eventId}:${r.round}:${r.heatIndex}`)
  );
}

/** 大会タブの一覧・ロスター等 */
export const loadClubCompetitionTabData = cache(
  async (clubId: string, clubName: string): Promise<ClubCompetitionTabData> => {
    const now = new Date();

    const [clubTeamEntries, individualEntriesForClub, toAssignments, toInvitations, toAppCompetitionIds] =
      await Promise.all([
        prisma.teamEntry.findMany({
          where: { clubId },
          select: {
            id: true,
            eventId: true,
            competitionId: true,
          },
        }),
        prisma.competitionEntry.findMany({
          where: { clubId, status: { not: "CANCELLED" } },
          select: { competitionId: true },
        }),
        prisma.competitionTechnicalOfficialAssignment.findMany({
          where: { clubId },
          select: { competitionId: true },
          distinct: ["competitionId"],
        }),
        prisma.competitionTechnicalOfficialInvitation.findMany({
          where: { clubId, status: "PENDING" },
          select: { competitionId: true },
          distinct: ["competitionId"],
        }),
        competitionIdsForClubFromApprovedTechnicalOfficialApplications(prisma, clubId, clubName),
      ]);

    const competitionIdsFromPlayerEntries = new Set([
      ...clubTeamEntries.map((t) => t.competitionId),
      ...individualEntriesForClub.map((e) => e.competitionId),
    ]);

    const competitionIdsFromToOnly = new Set<string>();
    for (const r of toAssignments) {
      if (!competitionIdsFromPlayerEntries.has(r.competitionId)) {
        competitionIdsFromToOnly.add(r.competitionId);
      }
    }
    for (const r of toInvitations) {
      if (!competitionIdsFromPlayerEntries.has(r.competitionId)) {
        competitionIdsFromToOnly.add(r.competitionId);
      }
    }

    const candidateCompetitionIds = [
      ...new Set([
        ...competitionIdsFromPlayerEntries,
        ...toAssignments.map((r) => r.competitionId),
        ...toInvitations.map((r) => r.competitionId),
        ...toAppCompetitionIds,
      ]),
    ];

    const eligibleCompetitions =
      candidateCompetitionIds.length === 0
        ? []
        : await prisma.competition.findMany({
            where: { id: { in: candidateCompetitionIds } },
            select: {
              id: true,
              name: true,
              venue: true,
              startDate: true,
              entryStartDate: true,
              entryEndDate: true,
              startListSettings: true,
              status: true,
              officialRecruitmentEnabled: true,
              technicalOfficialRecruitmentEnabled: true,
              technicalOfficialTiers: true,
            },
          });
    const eligibleCompetitionById = new Map(eligibleCompetitions.map((c) => [c.id, c]));

    const technicalOfficialCompetitions: { id: string; name: string }[] = [];
    for (const c of eligibleCompetitions) {
      if (!c.officialRecruitmentEnabled || !c.technicalOfficialRecruitmentEnabled) continue;
      technicalOfficialCompetitions.push({ id: c.id, name: c.name });
    }
    technicalOfficialCompetitions.sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const competitionRows = (() => {
      const map = new Map<
        string,
        {
          competition: (typeof eligibleCompetitions)[0];
          entries: { id: string; eventId: string }[];
        }
      >();
      for (const row of clubTeamEntries) {
        const c = eligibleCompetitionById.get(row.competitionId);
        if (!c) continue;
        const prev = map.get(c.id);
        const piece = { id: row.id, eventId: row.eventId };
        if (prev) {
          prev.entries.push(piece);
        } else {
          map.set(c.id, { competition: c, entries: [piece] });
        }
      }
      for (const e of individualEntriesForClub) {
        const c = eligibleCompetitionById.get(e.competitionId);
        if (!c) continue;
        if (!map.has(c.id)) {
          map.set(c.id, { competition: c, entries: [] });
        }
      }
      for (const cid of candidateCompetitionIds) {
        const c = eligibleCompetitionById.get(cid);
        if (!c || map.has(c.id)) continue;
        map.set(c.id, { competition: c, entries: [] });
      }
      return [...map.values()].sort(
        (a, b) => b.competition.startDate.getTime() - a.competition.startDate.getTime()
      );
    })();

    const competitionRowsWithEntries = competitionRows.filter(({ entries }) => entries.length > 0);
    const competitionIdsWithEntries = competitionRowsWithEntries.map(({ competition }) => competition.id);

    const [snapshotRows, closedMarshalRows] =
      competitionIdsWithEntries.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.competitionStartListSnapshot.findMany({
              where: { competitionId: { in: competitionIdsWithEntries } },
              select: { competitionId: true, data: true },
            }),
            prisma.competitionHeatMarshalState.findMany({
              where: {
                competitionId: { in: competitionIdsWithEntries },
                callClosedAt: { not: null },
              },
              select: {
                competitionId: true,
                eventId: true,
                round: true,
                heatIndex: true,
              },
            }),
          ]);

    const snapshotByCompetitionId = new Map<string, StartListSnapshotPayload | null>();
    for (const row of snapshotRows) {
      snapshotByCompetitionId.set(
        row.competitionId,
        parseStartListSnapshotLooseForRoundRead(row.data)
      );
    }

    const closedRowsByCompetitionId = new Map<
      string,
      { eventId: string; round: string; heatIndex: number }[]
    >();
    for (const row of closedMarshalRows) {
      const list = closedRowsByCompetitionId.get(row.competitionId);
      if (list) {
        list.push(row);
      } else {
        closedRowsByCompetitionId.set(row.competitionId, [row]);
      }
    }

    const marshalAllBlockedByCompetitionId = new Map<string, boolean>();
    for (const { competition, entries } of competitionRows) {
      if (entries.length === 0) {
        marshalAllBlockedByCompetitionId.set(competition.id, false);
        continue;
      }
      const blockMap = await getTeamEntryMarshalAssignmentBlockedMap(
        prisma,
        competition.id,
        entries,
        {
          snapshot: snapshotByCompetitionId.get(competition.id) ?? null,
          closedMarshalHeatKeys: buildClosedMarshalHeatKeySet(
            closedRowsByCompetitionId.get(competition.id) ?? [],
            entries.map((e) => e.eventId)
          ),
        }
      );
      const allBlocked = entries.every((e) => blockMap.get(e.id));
      marshalAllBlockedByCompetitionId.set(competition.id, allBlocked);
    }

    const competitionTeamSummaries: ClubCompetitionTeamSummary[] = competitionRows.map(
      ({ competition, entries }) => {
        const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
        const deadline = resolveTeamAssignmentDeadline(
          competition.startListSettings,
          competition.startDate
        );
        const afterEntryEnd = entryEnd !== null && now > entryEnd;
        const assignmentOpen = afterEntryEnd && !marshalAllBlockedByCompetitionId.get(competition.id);
        return {
          id: competition.id,
          name: competition.name,
          startDate: competition.startDate,
          entryEndDate: entryEnd,
          teamCount: entries.length,
          assignmentOpen,
          assignmentDeadline: deadline,
          allTeamsMarshalBlocked: marshalAllBlockedByCompetitionId.get(competition.id) ?? false,
        };
      }
    );

    const competitionIdsForRoster = competitionRows.map((r) => r.competition.id);
    const [individualEntriesForRoster, teamEntriesForRoster] =
      competitionIdsForRoster.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.competitionEntry.findMany({
              where: {
                clubId,
                competitionId: { in: competitionIdsForRoster },
                status: { not: "CANCELLED" },
              },
              select: {
                competitionId: true,
                userId: true,
                user: { select: { profile: { select: { familyName: true, givenName: true } } } },
                items: {
                  select: {
                    event: { select: { name: true, type: true } },
                  },
                },
              },
            }),
            prisma.teamEntry.findMany({
              where: {
                clubId,
                competitionId: { in: competitionIdsForRoster },
              },
              select: {
                competitionId: true,
                teamName: true,
                event: { select: { name: true } },
                members: {
                  select: {
                    userId: true,
                    user: { select: { profile: { select: { familyName: true, givenName: true } } } },
                  },
                },
              },
            }),
          ]);

    const rosterByCompetitionId = buildClubCompetitionRosterMap(
      individualEntriesForRoster,
      teamEntriesForRoster
    );

    return {
      competitionSectionCount: competitionRows.length,
      competitionRows,
      competitionTeamSummaries,
      rosterByCompetitionId,
      summaryByCompetitionId: new Map(
        competitionTeamSummaries.map((s) => [s.id, s] as const)
      ),
      technicalOfficialCompetitionIdSet: new Set(
        technicalOfficialCompetitions.map((c) => c.id)
      ),
      competitionIdsFromToOnly,
    };
  }
);
