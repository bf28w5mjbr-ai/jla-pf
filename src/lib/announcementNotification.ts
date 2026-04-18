import { prisma } from "@/server/db";
import { createNotificationIfAbsent } from "@/lib/notificationService";

export async function notifyCompetitionAnnouncementPublished(params: {
  announcementId: string;
  competitionId: string;
  title: string;
  content: string;
}) {
  const [individualEntrants, teamEntrants] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId: params.competitionId,
        status: "SUBMITTED",
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.teamEntryMember.findMany({
      where: {
        teamEntry: {
          competitionId: params.competitionId,
        },
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const targetUserIds = new Set<string>();
  for (const row of individualEntrants) targetUserIds.add(row.userId);
  for (const row of teamEntrants) targetUserIds.add(row.userId);

  const body = params.content.length > 160 ? `${params.content.slice(0, 160)}...` : params.content;
  const linkUrl = `/competitions/${params.competitionId}`;

  await Promise.all(
    [...targetUserIds].map((userId) =>
      createNotificationIfAbsent({
        userId,
        category: "COMPETITION",
        type: "COMPETITION_ANNOUNCEMENT_PUBLISHED",
        title: `大会のお知らせ: ${params.title}`,
        body,
        relatedId: params.announcementId,
        linkUrl,
      })
    )
  );
}

export async function notifyClubAnnouncementPublished(params: {
  announcementId: string;
  clubId: string;
  title: string;
  content: string;
  authorId?: string;
}) {
  const members = await prisma.membership.findMany({
    where: {
      clubId: params.clubId,
      status: "APPROVED",
    },
    select: { userId: true },
  });

  const body = params.content.length > 160 ? `${params.content.slice(0, 160)}...` : params.content;
  const linkUrl = `/clubs/${params.clubId}`;

  await Promise.all(
    members
      .map((member) => member.userId)
      .filter((userId) => userId !== params.authorId)
      .map((userId) =>
        createNotificationIfAbsent({
          userId,
          category: "CLUB",
          type: "CLUB_ANNOUNCEMENT_PUBLISHED",
          title: `クラブのお知らせ: ${params.title}`,
          body,
          relatedId: params.announcementId,
          linkUrl,
        })
      )
  );
}
