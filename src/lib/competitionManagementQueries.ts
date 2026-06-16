import type { Prisma } from "@prisma/client";

/** ヒーロー（大会名・ステータス・主催団体名）用 */
export function buildCompetitionHeroSelect(userId: string): Prisma.CompetitionSelect {
  return {
    id: true,
    name: true,
    category: true,
    status: true,
    competitionType: true,
    startDate: true,
    endDate: true,
    venue: true,
    organization: {
      select: {
        name: true,
        admins: {
          where: { userId },
          select: { role: true },
        },
      },
    },
  };
}

/** オフィシャルタブ用（ヒーロー項目 + 募集・TO・当日運用フラグ） */
export function buildCompetitionOfficialSelect(userId: string): Prisma.CompetitionSelect {
  return {
    ...buildCompetitionHeroSelect(userId),
    officialRecruitmentEnabled: true,
    technicalOfficialRecruitmentEnabled: true,
    officialQualificationFilterEnabled: true,
    requireClubMembership: true,
    technicalOfficialTiers: true,
    dayOpsAccessSecretHash: true,
  };
}

/** 大会設定タブ用（お知らせ・添付・ギャラリー・種目・年齢区分など一式） */
export function buildCompetitionManagementIncludeForPageTab(
  userId: string
): Prisma.CompetitionInclude {
  return {
    organization: {
      include: {
        admins: {
          where: { userId },
        },
      },
    },
    technicalOfficialQualificationTemplate: {
      select: { id: true, name: true, kind: true },
    },
    announcements: {
      orderBy: { createdAt: "desc" },
    },
    attachments: {
      orderBy: { createdAt: "desc" },
    },
    galleryPhotos: {
      orderBy: { createdAt: "asc" },
    },
    events: {
      orderBy: { displayOrder: "asc" },
    },
    ageCategories: {
      orderBy: { displayOrder: "asc" },
    },
  };
}

/** エントリータブ用（ヘッダーと権限用の organization のみ） */
export function buildCompetitionManagementIncludeForEntriesTab(
  userId: string
): Prisma.CompetitionInclude {
  return {
    organization: {
      include: {
        admins: {
          where: { userId },
        },
      },
    },
  };
}
