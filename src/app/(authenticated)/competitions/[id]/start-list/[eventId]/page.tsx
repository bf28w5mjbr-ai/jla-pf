import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import type { ResultRound } from "@prisma/client";
import { parseStartListSettings } from "@/lib/startListSettings";
import { formatEventScheduleJa } from "@/lib/eventScheduleDisplay";
import { computePlacementSeed } from "@/lib/startListHeatPlacement";
import { extractFrozenRoundsForEventFromSnapshotData } from "@/lib/startListEventTabDisplay";
import {
  buildParticipantDayOpsStatusByKey,
  shouldHideFromStartListLineupParticipantRow,
} from "@/lib/dayOpsParticipantStatusDisplay";
import {
  ensureStartListSnapshotIfEligible,
  repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist,
} from "@/lib/startListSnapshot";
import { ChevronLeft } from "lucide-react";

const CompetitionStartListEventBlock = nextDynamic(
  () => import("@/components/CompetitionStartListEventBlock"),
  {
    loading: () => (
      <div className="min-h-[12rem] animate-pulse rounded-lg border border-border/60 bg-muted/25" />
    ),
  }
);

const StartListEventUnifiedCard = nextDynamic(
  () => import("@/components/StartListEventUnifiedCard"),
  {
    loading: () => (
      <div className="min-h-[14rem] animate-pulse rounded-lg border border-border/60 bg-muted/25" />
    ),
  }
);

export const dynamic = "force-dynamic";

/** メタデータとページ本体で同一リクエスト内の二重クエリを避ける */
const getStartListEventDetail = cache(async (competitionId: string, eventId: string) => {
  return prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: {
      id: true,
      name: true,
      sex: true,
      type: true,
      category: true,
      preliminaryHeatLaneCount: true,
      startListRoundCount: true,
      startListHeatPlanConfirmedAt: true,
      marshalStartedAt: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}): Promise<Metadata> {
  const { id, eventId } = await params;
  const event = await getStartListEventDetail(id, eventId);
  return {
    title: event?.name ? `${event.name} スタートリスト | Bluvium` : "スタートリスト | Bluvium",
  };
}

export default async function CompetitionEventStartListPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  try {
    await ensureStartListSnapshotIfEligible(competitionId);
    await repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist({
      competitionId,
      createdByUserId: session.userId,
    });
  } catch (e) {
    console.error("ensureStartListSnapshotIfEligible / repair snapshot:", e);
  }

  const [competition, event] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        status: true,
        startListSettings: true,
        organization: {
          select: {
            admins: {
              where: { userId: session.userId },
              select: { role: true },
            },
          },
        },
        officialApplications: {
          where: { userId: session.userId },
          select: { status: true },
          take: 1,
        },
        officialAttendances: {
          where: { userId: session.userId },
          select: { id: true },
          take: 1,
        },
        startListSnapshot: {
          select: { capturedAt: true, data: true },
        },
        events: {
          select: { id: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    }),
    getStartListEventDetail(competitionId, eventId),
  ]);

  if (!competition || !event) {
    notFound();
  }

  const isOrgAdmin = hasOrgAdminAccess(competition.organization.admins);
  const myOfficialApplication = competition.officialApplications[0] ?? null;
  const canEditStartListSplit = canManageCompetitionStartListSettings({
    orgAdminsForCurrentUser: competition.organization.admins,
    officialApplicationStatus: myOfficialApplication?.status ?? null,
    hasOfficialAttendance: competition.officialAttendances.length > 0,
  });
  const showUnifiedStartListCard = canEditStartListSplit;

  if (competition.status === "DRAFT" && !isOrgAdmin) {
    notFound();
  }

  const allEventIds = competition.events.map((e) => e.id);
  const { eventSettings: settings } = parseStartListSettings(competition.startListSettings);
  const setting = settings[event.id] ?? { mode: "count" as const, heatCount: "1", heatSize: "" };

  const [liveEntries, liveTeamEntries, officialResults, participantStatusRows] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [{ totalFee: { lte: 0 } }, { checkoutSessions: { some: { status: "COMPLETED" } } }],
        items: { some: { eventId } },
      },
      select: {
        id: true,
        userId: true,
        club: { select: { id: true, name: true } },
        user: { select: { familyName: true, givenName: true } },
        items: { where: { eventId }, select: { eventId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamEntry.findMany({
      where: { competitionId, eventId },
      select: {
        id: true,
        teamName: true,
        club: { select: { id: true, name: true } },
        members: {
          orderBy: { order: "asc" },
          select: {
            user: { select: { familyName: true, givenName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.officialResult.findMany({
      where: { competitionId, eventId },
      select: {
        round: true,
        rows: {
          select: {
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
            rank: true,
          },
        },
      },
    }),
    prisma.competitionParticipantStatus.findMany({
      where: { competitionId, eventId },
      orderBy: { updatedAt: "desc" },
      select: {
        participantType: true,
        competitionEntryId: true,
        teamEntryId: true,
        teamMemberUserId: true,
        status: true,
        reason: true,
        marshalRound: true,
        updatedAt: true,
        calledAt: true,
      },
    }),
  ]);

  const participantStatusByKey = buildParticipantDayOpsStatusByKey(participantStatusRows);

  const excludedIndividualEntryIds = new Set<string>();
  const indRowsByEntry = new Map<string, typeof participantStatusRows>();
  for (const row of participantStatusRows) {
    if (row.participantType !== "INDIVIDUAL" || !row.competitionEntryId) continue;
    const id = row.competitionEntryId;
    if (!indRowsByEntry.has(id)) indRowsByEntry.set(id, []);
    indRowsByEntry.get(id)!.push(row);
  }
  for (const [entryId, rows] of indRowsByEntry) {
    if (
      rows.some((r) =>
        shouldHideFromStartListLineupParticipantRow({ status: r.status, reason: r.reason })
      )
    ) {
      excludedIndividualEntryIds.add(entryId);
    }
  }
  const excludedTeamEntryIds = new Set<string>();
  const teamRowsById = new Map<string, typeof participantStatusRows>();
  for (const row of participantStatusRows) {
    if (row.participantType !== "TEAM" || !row.teamEntryId) continue;
    const id = row.teamEntryId;
    if (!teamRowsById.has(id)) teamRowsById.set(id, []);
    teamRowsById.get(id)!.push(row);
  }
  for (const [teamId, rows] of teamRowsById) {
    if (
      rows.some((r) =>
        shouldHideFromStartListLineupParticipantRow({ status: r.status, reason: r.reason })
      )
    ) {
      excludedTeamEntryIds.add(teamId);
    }
  }

  const officialRanksByRound: Partial<Record<ResultRound, Record<string, number>>> = {};
  for (const or of officialResults) {
    const m: Record<string, number> = {};
    for (const row of or.rows) {
      if (typeof row.rank !== "number" || !Number.isFinite(row.rank)) continue;
      const key =
        row.entryType === "TEAM" ? row.teamEntryId : row.competitionEntryId;
      if (!key) continue;
      const prev = m[key];
      if (prev === undefined || row.rank < prev) m[key] = row.rank;
    }
    if (Object.keys(m).length > 0) {
      officialRanksByRound[or.round] = m;
    }
  }

  const individuals: Array<{
    entryId: string;
    userId: string;
    name: string;
    clubId: string | null;
    clubName: string | null;
  }> = [];
  const placementIndividualIds: string[] = [];
  for (const entry of liveEntries) {
    if (excludedIndividualEntryIds.has(entry.id)) continue;
    const item = entry.items[0];
    if (!item) continue;
    placementIndividualIds.push(entry.id);
    individuals.push({
      entryId: entry.id,
      userId: entry.userId,
      name: `${entry.user.familyName} ${entry.user.givenName}`,
      clubId: entry.club?.id ?? null,
      clubName: entry.club?.name ?? null,
    });
  }
  placementIndividualIds.sort();

  const teams: Array<{
    teamEntryId: string;
    teamName: string;
    clubId: string | null;
    clubName: string | null;
    members: string[];
  }> = [];
  const placementTeamIds: string[] = [];
  for (const teamEntry of liveTeamEntries) {
    if (excludedTeamEntryIds.has(teamEntry.id)) continue;
    placementTeamIds.push(teamEntry.id);
    teams.push({
      teamEntryId: teamEntry.id,
      teamName: teamEntry.teamName,
      clubId: teamEntry.club?.id ?? null,
      clubName: teamEntry.club?.name ?? null,
      members: teamEntry.members
        .map((member) => `${member.user.familyName} ${member.user.givenName}`)
        .filter(Boolean),
    });
  }
  placementTeamIds.sort();

  const scheduleLabel = formatEventScheduleJa(event.scheduledStartAt, event.scheduledEndAt);
  const archiveRecordedAtIso = competition.startListSnapshot?.capturedAt
    ? new Date(competition.startListSnapshot.capturedAt).toISOString()
    : null;

  const placementFingerprint = `${archiveRecordedAtIso ?? ""}|i:${placementIndividualIds.join(",")}|t:${placementTeamIds.join(",")}`;
  const placementSeed = computePlacementSeed(competitionId, eventId, placementFingerprint);

  const frozenSnapshotRounds = extractFrozenRoundsForEventFromSnapshotData(
    competition.startListSnapshot?.data,
    eventId
  );

  return (
    <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
          <Link href={`/competitions/${competitionId}?tab=start-list`}>
            <ChevronLeft className="size-4" />
            種目一覧へ
          </Link>
        </Button>
      </div>

      {showUnifiedStartListCard ? (
        <StartListEventUnifiedCard
          competitionId={competitionId}
          competitionName={competition.name}
          archiveRecordedAtIso={archiveRecordedAtIso}
          event={{
            id: event.id,
            name: event.name,
            sex: event.sex,
            type: event.type,
          }}
          allEventIds={allEventIds}
          initialSettings={competition.startListSettings}
          defaultMaxLanesPerRace={event.preliminaryHeatLaneCount}
          configuredStartListRoundCount={event.startListRoundCount ?? null}
          entryCount={event.type === "TEAM" ? teams.length : individuals.length}
          scheduleLabel={scheduleLabel}
          individuals={individuals}
          teams={teams}
          officialRanksByRound={officialRanksByRound}
          placementSeed={placementSeed}
          frozenSnapshotRounds={frozenSnapshotRounds}
          startListRoundCount={event.startListRoundCount ?? null}
          preliminaryHeatLaneCount={event.preliminaryHeatLaneCount ?? null}
          heatPlanConfirmedAtIso={event.startListHeatPlanConfirmedAt?.toISOString() ?? null}
          marshalStartedAtIso={event.marshalStartedAt?.toISOString() ?? null}
          canEditHeatConfiguration={canEditStartListSplit}
          showMarshalOps={isOrgAdmin}
          showResultOps={isOrgAdmin}
          participantStatusByKey={participantStatusByKey}
          initialParticipantStatusRows={participantStatusRows}
        />
      ) : (
        <CompetitionStartListEventBlock
          competitionName={competition.name}
          archiveRecordedAtIso={archiveRecordedAtIso}
          scheduleLabel={scheduleLabel}
          event={{
            id: event.id,
            name: event.name,
            sex: event.sex,
            type: event.type,
          }}
          individuals={individuals}
          teams={teams}
          setting={setting}
          officialRanksByRound={officialRanksByRound}
          placementSeed={placementSeed}
          frozenSnapshotRounds={frozenSnapshotRounds}
          startListRoundCount={event.startListRoundCount ?? null}
          preliminaryHeatLaneCount={event.preliminaryHeatLaneCount ?? null}
          heatPlanStep1Confirmed={Boolean(event.startListHeatPlanConfirmedAt)}
          participantStatusByKey={participantStatusByKey}
          initialParticipantStatusRows={participantStatusRows}
          softRefreshIntervalSec={25}
        />
      )}
    </div>
  );
}
