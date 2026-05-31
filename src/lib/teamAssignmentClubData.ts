import type { PrismaClient } from "@prisma/client";
import { getTeamEntryMarshalAssignmentBlockedMap } from "@/lib/teamMemberAssignmentWindow";
import {
  filterEligibleMembersForTeamAssignmentEvent,
  prismaCompetitionToTeamAssignmentCompetitionJson,
  prismaEventToTeamAssignmentEventJson,
  type TeamAssignmentCompetitionJson,
  type TeamAssignmentEligibleMemberJson,
  type TeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";
import {
  buildMemberSlotsFromDb,
  parseRelayPositionNames,
  resolveTeamRelaySlotCount,
  type TeamEntryAssignmentDto,
} from "@/lib/teamMemberSlots";

type TeamEntryWithEvent = {
  id: string;
  clubId: string;
  eventId: string;
  teamName: string;
  event: {
    id: string;
    name: string;
    sex: "MALE" | "FEMALE" | "OTHER";
    minAge: number | null;
    maxAge: number | null;
    eligibleBirthDateFrom: Date | null;
    eligibleBirthDateTo: Date | null;
    ageCategoryId: string | null;
    teamRelayPositionCount: number | null;
    teamRelayPositionNames: unknown;
  };
  members: { userId: string; order: number | null; role: string | null }[];
};

export function mapEligibleEntriesToMembers(
  eligibleEntries: {
    user: {
      id: string;
      profile: {
        familyName: string | null;
        givenName: string | null;
        sex: "MALE" | "FEMALE" | "OTHER";
        dateOfBirth: Date | null;
      } | null;
    };
  }[]
): TeamAssignmentEligibleMemberJson[] {
  return eligibleEntries.flatMap((entry) =>
    entry.user.profile
      ? [
          {
            userId: entry.user.id,
            name: `${entry.user.profile.familyName} ${entry.user.profile.givenName}`.trim(),
            sex: entry.user.profile.sex,
            dateOfBirth: entry.user.profile.dateOfBirth
              ? entry.user.profile.dateOfBirth.toISOString()
              : null,
          },
        ]
      : []
  );
}

export function buildTeamAssignmentEventsByIdFromEntries(
  teamEntries: readonly TeamEntryWithEvent[]
): Record<string, TeamAssignmentEventJson> {
  const out: Record<string, TeamAssignmentEventJson> = {};
  for (const entry of teamEntries) {
    if (!out[entry.eventId]) {
      out[entry.eventId] = prismaEventToTeamAssignmentEventJson(entry.event);
    }
  }
  return out;
}

export function buildAssignmentsForClub(params: {
  teamEntries: readonly TeamEntryWithEvent[];
  clubEligibleMembers: readonly TeamAssignmentEligibleMemberJson[];
  competitionJson: TeamAssignmentCompetitionJson;
  eventsById: Record<string, TeamAssignmentEventJson>;
}): TeamEntryAssignmentDto[] {
  const { teamEntries, clubEligibleMembers, competitionJson, eventsById } = params;

  return teamEntries.map((entry) => {
    const slotCount = resolveTeamRelaySlotCount(
      entry.event.teamRelayPositionCount,
      entry.members
    );
    const memberSlots = buildMemberSlotsFromDb(entry.members, slotCount);
    const eventJson = eventsById[entry.eventId];
    const eventEligible = eventJson
      ? filterEligibleMembersForTeamAssignmentEvent(
          clubEligibleMembers,
          eventJson,
          competitionJson
        )
      : [...clubEligibleMembers];

    const assignedIds = new Set(memberSlots.filter(Boolean) as string[]);
    const eligibleById = new Map(eventEligible.map((m) => [m.userId, m]));
    for (const userId of assignedIds) {
      if (!eligibleById.has(userId)) {
        const assigned = clubEligibleMembers.find((m) => m.userId === userId);
        if (assigned) eligibleById.set(userId, assigned);
      }
    }

    return {
      teamEntryId: entry.id,
      eventId: entry.eventId,
      eventName: entry.event.name,
      sexLabel:
        entry.event.sex === "MALE"
          ? "男子"
          : entry.event.sex === "FEMALE"
            ? "女子"
            : "混合",
      teamName: entry.teamName,
      relayPositionCount: entry.event.teamRelayPositionCount ?? null,
      relayPositionLabels: parseRelayPositionNames(entry.event.teamRelayPositionNames),
      memberSlots,
      eligibleMembers: [...eligibleById.values()],
    };
  });
}

export type TeamAssignmentClubPayload = {
  assignments: TeamEntryAssignmentDto[];
  eligibleMembers: TeamAssignmentEligibleMemberJson[];
  marshalBlockByTeamEntryId: Record<string, boolean>;
  teamAssignmentEventsById: Record<string, TeamAssignmentEventJson>;
};

export async function loadTeamAssignmentClubPayload(
  prisma: Pick<PrismaClient, "teamEntry" | "competitionEntry" | "competitionHeatMarshalState">,
  params: {
    competitionId: string;
    clubId: string;
    competitionStartDate: Date;
    ageCategories: {
      id: string;
      displayOrder: number;
      eligibleBirthDateFrom: Date | null;
      eligibleBirthDateTo: Date | null;
    }[];
  }
): Promise<TeamAssignmentClubPayload> {
  const { competitionId, clubId, competitionStartDate, ageCategories } = params;

  const [teamEntries, eligibleEntries] = await Promise.all([
    prisma.teamEntry.findMany({
      where: { competitionId, clubId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            sex: true,
            minAge: true,
            maxAge: true,
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
            ageCategoryId: true,
            teamRelayPositionCount: true,
            teamRelayPositionNames: true,
          },
        },
        members: {
          orderBy: { order: "asc" },
          select: { userId: true, order: true, role: true },
        },
      },
      orderBy: [
        { event: { category: "asc" } },
        { event: { ageCategory: { displayOrder: "asc" } } },
        { event: { displayOrder: "asc" } },
        { teamName: "asc" },
        { id: "asc" },
      ],
    }),
    prisma.competitionEntry.findMany({
      where: { competitionId, clubId, status: "SUBMITTED" },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: { familyName: true, givenName: true, sex: true, dateOfBirth: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const teamEntryRefs = teamEntries.map((e) => ({ id: e.id, eventId: e.eventId }));
  const marshalBlockMap = await getTeamEntryMarshalAssignmentBlockedMap(
    prisma,
    competitionId,
    teamEntryRefs
  );

  const competitionJson = prismaCompetitionToTeamAssignmentCompetitionJson({
    startDate: competitionStartDate,
    ageCategories,
  });
  const teamAssignmentEventsById = buildTeamAssignmentEventsByIdFromEntries(teamEntries);
  const eligibleMembers = mapEligibleEntriesToMembers(eligibleEntries);
  const assignments = buildAssignmentsForClub({
    teamEntries,
    clubEligibleMembers: eligibleMembers,
    competitionJson,
    eventsById: teamAssignmentEventsById,
  });

  return {
    assignments,
    eligibleMembers,
    marshalBlockByTeamEntryId: Object.fromEntries(marshalBlockMap),
    teamAssignmentEventsById,
  };
}
