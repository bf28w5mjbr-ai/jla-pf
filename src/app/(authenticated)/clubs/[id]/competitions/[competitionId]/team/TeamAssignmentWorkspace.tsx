import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { canViewCompetitionAsHostDraft } from "@/lib/competitionStartListAccess";
import CompetitionTeamAssignmentManager from "@/components/CompetitionTeamAssignmentManager";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";
import { prismaCompetitionToTeamAssignmentCompetitionJson } from "@/lib/teamMemberSlotEligibility";
import {
  buildAssignmentsForClub,
  buildTeamAssignmentEventsByIdFromEntries,
  mapEligibleEntriesToMembers,
} from "@/lib/teamAssignmentClubData";

type ClubOption = {
  id: string;
  name: string;
  abbreviation: string | null;
};

export default async function TeamAssignmentWorkspace({
  competitionId,
  userId,
  initialClubId,
  adminClubs,
  adminClubIds,
}: {
  competitionId: string;
  userId: string;
  initialClubId: string;
  adminClubs: ClubOption[];
  adminClubIds: string[];
}) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId },
          },
        },
      },
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          displayOrder: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
        },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  const canViewHostDraft = canViewCompetitionAsHostDraft({
    orgAdminsForCurrentUser: competition.organization.admins,
  });
  if (competition.status === "DRAFT" && !canViewHostDraft) {
    notFound();
  }

  const now = new Date();
  const teamAssignmentWindow = await getTeamMemberAssignmentWindowState(
    prisma,
    competition.id,
    {
      entryEndDate: competition.entryEndDate,
      startListSettings: competition.startListSettings,
      startDate: competition.startDate,
    },
    now
  );

  const lazyLoadClubs = adminClubIds.length > 1;
  const clubIdsToLoad = lazyLoadClubs ? [initialClubId] : adminClubIds;

  const teamEntriesFull = await prisma.teamEntry.findMany({
    where: {
      competitionId: competition.id,
      clubId: { in: clubIdsToLoad },
    },
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
        select: {
          userId: true,
          order: true,
          role: true,
        },
      },
    },
    orderBy: [
      { clubId: "asc" },
      { event: { category: "asc" } },
      { event: { ageCategory: { displayOrder: "asc" } } },
      { event: { displayOrder: "asc" } },
      { teamName: "asc" },
      { id: "asc" },
    ],
  });

  const marshalTeamEntryRefs =
    adminClubIds.length === 1
      ? teamEntriesFull.map((e) => ({ id: e.id, eventId: e.eventId }))
      : teamEntriesFull
          .filter((e) => e.clubId === initialClubId)
          .map((e) => ({ id: e.id, eventId: e.eventId }));

  const [eligibleEntries, marshalBlockByTeamEntryId] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId: competition.id,
        clubId: { in: clubIdsToLoad },
        status: "SUBMITTED",
      },
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
      orderBy: [{ clubId: "asc" }, { createdAt: "asc" }],
    }),
    getTeamEntryMarshalAssignmentBlockedMap(prisma, competition.id, marshalTeamEntryRefs).then(
      (map) => Object.fromEntries(map)
    ),
  ]);

  const competitionJson = prismaCompetitionToTeamAssignmentCompetitionJson({
    startDate: competition.startDate,
    ageCategories: competition.ageCategories,
  });
  const teamAssignmentEventsById = buildTeamAssignmentEventsByIdFromEntries(teamEntriesFull);

  const eligibleMembersByClub = Object.fromEntries(
    clubIdsToLoad.map((cid) => [
      cid,
      mapEligibleEntriesToMembers(eligibleEntries.filter((entry) => entry.clubId === cid)),
    ])
  );

  const assignmentsByClub = Object.fromEntries(
    clubIdsToLoad.map((cid) => {
      const clubEligibleMembers = eligibleMembersByClub[cid] ?? [];
      const clubTeamEntries = teamEntriesFull.filter((entry) => entry.clubId === cid);
      return [
        cid,
        buildAssignmentsForClub({
          teamEntries: clubTeamEntries,
          clubEligibleMembers,
          competitionJson,
          eventsById: teamAssignmentEventsById,
        }),
      ];
    })
  );

  return (
    <>
      <header className="space-y-2 border-b border-border/60 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          メンバー割当
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          ポジションにメンバーを割り当て、大会側スタートリスト反映の前提とします。保存で大会に送信されます。
          {teamAssignmentWindow.deadlineLabel ? (
            <>
              {" "}
              <span className="tabular-nums text-foreground/90">
                目安日時（通知用）: {teamAssignmentWindow.deadlineLabel}
              </span>
            </>
          ) : null}
        </p>
      </header>

      <CompetitionTeamAssignmentManager
        competitionId={competition.id}
        clubs={adminClubs}
        assignmentsByClub={assignmentsByClub}
        eligibleMembersByClub={eligibleMembersByClub}
        isAssignmentWindowOpen={teamAssignmentWindow.open}
        assignmentDeadlineLabel={teamAssignmentWindow.deadlineLabel}
        marshalBlockByTeamEntryId={marshalBlockByTeamEntryId}
        initialClubId={initialClubId}
        lazyLoadClubs={lazyLoadClubs}
      />
    </>
  );
}
