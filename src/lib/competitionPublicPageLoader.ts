import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

const NO_SESSION_USER_ID = "clinvalidnosessionuser0000";

const competitionPublicDetailInclude = (sessionUserId: string | null) =>
  ({
    organization: {
      include: {
        admins: {
          where: { userId: sessionUserId ?? NO_SESSION_USER_ID },
        },
      },
    },
    technicalOfficialQualificationTemplate: {
      select: { name: true },
    },
    announcements: {
      where: { publishedAt: { not: null } },
      orderBy: { createdAt: "desc" as const },
    },
    attachments: {
      orderBy: { createdAt: "desc" as const },
    },
    galleryPhotos: {
      orderBy: { createdAt: "asc" as const },
      select: { id: true, imageUrl: true, fileName: true },
    },
    ageCategories: {
      orderBy: { displayOrder: "asc" as const },
      select: { id: true, name: true, displayOrder: true },
    },
    scheduleTabs: {
      orderBy: { displayOrder: "asc" as const },
      select: { id: true, name: true, displayOrder: true, scheduleRowOrder: true },
    },
    events: {
      select: {
        id: true,
        name: true,
        sex: true,
        type: true,
        category: true,
        displayOrder: true,
        scheduledStartAt: true,
        roundScheduledStarts: true,
        scheduledEndAt: true,
        startListRoundCount: true,
        preliminaryHeatLaneCount: true,
        startListHeatPlanConfirmedAt: true,
        marshalStartedAt: true,
        scheduleTabId: true,
        scheduleTabSortOrder: true,
        ageCategory: {
          select: { id: true, name: true, displayOrder: true },
        },
      },
      orderBy: [{ displayOrder: "asc" as const }, { sex: "asc" as const }, { id: "asc" as const }],
    },
    officialApplications: {
      where: { userId: sessionUserId ?? NO_SESSION_USER_ID },
      select: { status: true, positionName: true, message: true },
      take: 1,
    },
  }) satisfies Prisma.CompetitionInclude;

export type CompetitionPublicDetail = Prisma.CompetitionGetPayload<{
  include: ReturnType<typeof competitionPublicDetailInclude>;
}>;

/** generateMetadata 用（session 不要） */
export const getCompetitionPublicName = cache(async (competitionId: string) => {
  return prisma.competition.findUnique({
    where: { id: competitionId },
    select: { name: true },
  });
});

/** 公開大会ページ本体の大会行（同一リクエスト内は sessionUserId ごとにメモ化） */
export const loadCompetitionPublicDetail = cache(
  async (competitionId: string, sessionUserId: string | null) => {
    return prisma.competition.findUnique({
      where: { id: competitionId },
      include: competitionPublicDetailInclude(sessionUserId),
    });
  }
);

const sessionMembershipSelect = {
  include: { club: { select: { id: true, name: true } } },
  orderBy: { club: { name: "asc" as const } },
} as const;

export type SessionContextForPublicCompetition = {
  sessionApprovedMemberships: Prisma.MembershipGetPayload<typeof sessionMembershipSelect>[];
  sessionUserForInquiry: {
    profile: { familyName: string; givenName: string } | null;
  } | null;
};

/** ログイン時のクラブ一覧・問い合わせ氏名（大会取得の後に実行） */
export const loadSessionContextForPublicCompetition = cache(
  async (sessionUserId: string): Promise<SessionContextForPublicCompetition> => {
    const [sessionApprovedMemberships, sessionUserForInquiry] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: sessionUserId, status: "APPROVED" },
        ...sessionMembershipSelect,
      }),
      prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { profile: { select: { familyName: true, givenName: true } } },
      }),
    ]);
    return { sessionApprovedMemberships, sessionUserForInquiry };
  }
);
