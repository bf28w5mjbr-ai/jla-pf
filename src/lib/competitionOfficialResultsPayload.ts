import type { Prisma } from "@prisma/client";
import { isPfOrAccAdmin, verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { mergeOfficialResultVisibilityFilter } from "@/lib/officialResultPublicVisibility";
import { buildResultRoundLabelMap, type ResultRoundUiKey } from "@/lib/resultRoundLabels";
import { prisma } from "@/server/db";

const officialResultListInclude = {
  event: { select: { id: true, name: true } },
  rows: {
    select: {
      id: true,
      entryType: true,
      competitionEntryId: true,
      teamEntryId: true,
      rank: true,
      status: true,
      resultValue: true,
      unit: true,
      resultText: true,
      penaltyValue: true,
      remarks: true,
      lane: true,
      heat: true,
    },
    orderBy: [{ heat: "asc" }, { rank: "asc" }],
  },
} satisfies Prisma.OfficialResultInclude;

export type CompetitionOfficialResultsPayload = {
  results: Prisma.OfficialResultGetPayload<{ include: typeof officialResultListInclude }>[];
  roundLabelsByEventId: Record<string, Partial<Record<ResultRoundUiKey, string>>>;
};

/**
 * 公式結果 API と認証済み RSC で共有する読み取りロジック。
 */
export async function loadCompetitionOfficialResultsPayload(
  competitionId: string,
  viewerUserId: string | null
): Promise<CompetitionOfficialResultsPayload | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { organizationId: true, startListSettings: true },
  });

  if (!competition) {
    return null;
  }

  let canViewUnpublished = false;
  if (viewerUserId) {
    if (await isPfOrAccAdmin(viewerUserId)) {
      canViewUnpublished = true;
    } else {
      try {
        await requireOrgAdmin(competition.organizationId, viewerUserId, "operational");
        canViewUnpublished = true;
      } catch {
        canViewUnpublished = false;
      }
    }
  }

  const results = await prisma.officialResult.findMany({
    where: mergeOfficialResultVisibilityFilter({ competitionId }, canViewUnpublished),
    include: officialResultListInclude,
    orderBy: [{ eventId: "asc" }, { round: "asc" }],
  });

  const eventIds = [...new Set(results.map((r) => r.eventId))];
  const eventRows =
    eventIds.length > 0
      ? await prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, startListRoundCount: true },
        })
      : [];
  const roundLabelsByEventId: Record<string, Partial<Record<ResultRoundUiKey, string>>> = {};
  for (const er of eventRows) {
    roundLabelsByEventId[er.id] = buildResultRoundLabelMap(
      competition.startListSettings,
      er.id,
      er.startListRoundCount
    );
  }

  return { results, roundLabelsByEventId };
}

/** API Route 用: Cookie から viewer を解決してペイロードを返す */
export async function loadCompetitionOfficialResultsPayloadFromRequest(
  competitionId: string,
  sessionToken: string | null | undefined
): Promise<CompetitionOfficialResultsPayload | null> {
  const session = sessionToken ? await verifySession(sessionToken) : null;
  return loadCompetitionOfficialResultsPayload(competitionId, session?.userId ?? null);
}
