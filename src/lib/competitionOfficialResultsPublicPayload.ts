import type { Prisma, ResultRound } from "@prisma/client";
import { mapRoundIndexToOfficialResultRound } from "@/lib/competitionPublicRoundIndex";
import { buildResultRoundLabelMap, type ResultRoundUiKey } from "@/lib/resultRoundLabels";
import { prisma } from "@/server/db";

const officialResultPublicRowInclude = {
  competitionEntry: {
    include: {
      user: {
        select: {
          profile: { select: { familyName: true, givenName: true } },
        },
      },
      club: { select: { name: true } },
    },
  },
  teamEntry: {
    include: {
      club: { select: { name: true } },
      members: {
        orderBy: { order: "asc" as const },
        include: {
          user: {
            select: {
              profile: { select: { familyName: true, givenName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OfficialResultRowInclude;

const officialResultPublicListInclude = {
  event: { select: { id: true, name: true, startListRoundCount: true } },
  rows: {
    include: officialResultPublicRowInclude,
    orderBy: [{ heat: "asc" as const }, { rank: "asc" as const }],
  },
} satisfies Prisma.OfficialResultInclude;

export type CompetitionOfficialResultsPublicPayload = {
  competition: {
    id: string;
    name: string;
    startListSettings: unknown;
  };
  event: {
    id: string;
    name: string;
    startListRoundCount: number | null;
  };
  results: Prisma.OfficialResultGetPayload<{
    include: typeof officialResultPublicListInclude;
  }>[];
  roundLabelsByEventId: Record<string, Partial<Record<ResultRoundUiKey, string>>>;
  highlightRound: ResultRound | null;
};

export async function loadCompetitionOfficialResultsPublicPayload(
  competitionId: string,
  eventId: string,
  options?: { roundIndex?: number | null }
): Promise<CompetitionOfficialResultsPublicPayload | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      startListSettings: true,
    },
  });
  if (!competition) {
    return null;
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: { id: true, name: true, startListRoundCount: true },
  });
  if (!event) {
    return null;
  }

  const highlightRound =
    options?.roundIndex != null && Number.isInteger(options.roundIndex)
      ? mapRoundIndexToOfficialResultRound(options.roundIndex, event.startListRoundCount)
      : null;

  const results = await prisma.officialResult.findMany({
    where: {
      competitionId,
      eventId,
      publishedAt: { not: null },
      ...(highlightRound ? { round: highlightRound } : {}),
    },
    include: officialResultPublicListInclude,
    orderBy: [{ round: "asc" }],
  });

  const roundLabelsByEventId: Record<string, Partial<Record<ResultRoundUiKey, string>>> = {
    [event.id]: buildResultRoundLabelMap(
      competition.startListSettings,
      event.id,
      event.startListRoundCount
    ),
  };

  return {
    competition,
    event,
    results,
    roundLabelsByEventId,
    highlightRound,
  };
}
