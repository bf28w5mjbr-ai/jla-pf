import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { canViewCompetitionAsHostDraft } from "@/lib/competitionStartListAccess";
import CompetitionTeamAssignmentManager from "@/components/CompetitionTeamAssignmentManager";
import {
  getTeamEntryMarshalAssignmentBlockedMap,
  getTeamMemberAssignmentWindowState,
} from "@/lib/teamMemberAssignmentWindow";
import {
  prismaCompetitionToTeamAssignmentCompetitionJson,
  prismaEventToTeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";
import {
  buildMemberSlotsFromDb,
  parseRelayPositionNames,
  resolveTeamRelaySlotCount,
} from "@/lib/teamMemberSlots";

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
      events: {
        where: { type: "TEAM" },
        orderBy: [
          { category: "asc" },
          { ageCategory: { displayOrder: "asc" } },
          { displayOrder: "asc" },
        ],
        include: {
          ageCategory: {
            select: { id: true, displayOrder: true },
          },
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

  const teamEntriesFull = await prisma.teamEntry.findMany({
    where: {
      competitionId: competition.id,
      clubId: { in: adminClubIds },
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
          ageCategory: {
            select: { id: true, displayOrder: true },
          },
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

  const teamEntryRefs = teamEntriesFull.map((e) => ({ id: e.id, eventId: e.eventId }));

  const [eligibleEntries, marshalBlockByTeamEntryId] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId: competition.id,
        clubId: { in: adminClubIds },
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
    getTeamEntryMarshalAssignmentBlockedMap(prisma, competition.id, teamEntryRefs).then((map) =>
      Object.fromEntries(map)
    ),
  ]);

  const assignmentsByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      teamEntriesFull
        .filter((entry) => entry.clubId === cid)
        .map((entry) => {
          const slotCount = resolveTeamRelaySlotCount(
            entry.event.teamRelayPositionCount,
            entry.members
          );
          const memberSlots = buildMemberSlotsFromDb(entry.members, slotCount);
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
          };
        }),
    ])
  );

  const eligibleMembersByClub = Object.fromEntries(
    adminClubIds.map((cid) => [
      cid,
      eligibleEntries
        .filter((entry) => entry.clubId === cid)
        .flatMap((entry) =>
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
        ),
    ])
  );

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

  const teamAssignmentCompetition = prismaCompetitionToTeamAssignmentCompetitionJson({
    startDate: competition.startDate,
    ageCategories: competition.ageCategories,
  });

  const teamAssignmentEventsById = Object.fromEntries(
    competition.events.map((e) => [
      e.id,
      prismaEventToTeamAssignmentEventJson({
        sex: e.sex,
        minAge: e.minAge,
        maxAge: e.maxAge,
        eligibleBirthDateFrom: e.eligibleBirthDateFrom,
        eligibleBirthDateTo: e.eligibleBirthDateTo,
        ageCategoryId: e.ageCategoryId,
      }),
    ])
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
        teamAssignmentCompetition={teamAssignmentCompetition}
        teamAssignmentEventsById={teamAssignmentEventsById}
      />
    </>
  );
}
