import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db";
import { competitionPublicPageTag } from "@/lib/cacheTags";
import { withPrismaPoolRetryOnce } from "@/lib/prismaPool";

const NO_SESSION_USER_ID = "clinvalidnosessionuser0000";

/** 未ログイン向け公開大会データの ISR 相当キャッシュ（秒） */
const ANON_PUBLIC_REVALIDATE_SECONDS = 60;

const orgAdminsForSession = (sessionUserId: string | null) =>
  ({
    organization: {
      include: {
        admins: {
          where: { userId: sessionUserId ?? NO_SESSION_USER_ID },
        },
      },
    },
  }) satisfies Prisma.CompetitionInclude;

const officialApplicationsForSession = (sessionUserId: string | null) =>
  ({
    officialApplications: {
      where: { userId: sessionUserId ?? NO_SESSION_USER_ID },
      select: { status: true, positionName: true, message: true },
      take: 1,
    },
  }) satisfies Prisma.CompetitionInclude;

/** ヘッダー・エントリー導線用の軽量 include */
const competitionPublicShellInclude = (sessionUserId: string | null) =>
  ({
    ...orgAdminsForSession(sessionUserId),
    ...officialApplicationsForSession(sessionUserId),
    events: {
      select: { id: true, type: true },
      orderBy: [{ displayOrder: "asc" as const }, { sex: "asc" as const }, { id: "asc" as const }],
    },
  }) satisfies Prisma.CompetitionInclude;

/** 大会ページタブ用 */
const competitionPublicOverviewInclude = (sessionUserId: string | null) =>
  ({
    ...orgAdminsForSession(sessionUserId),
    announcements: {
      where: { publishedAt: { not: null } },
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
    events: {
      select: {
        id: true,
        name: true,
        sex: true,
        type: true,
        category: true,
        displayOrder: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        scheduleTabId: true,
        scheduleTabSortOrder: true,
        ageCategory: {
          select: { id: true, name: true, displayOrder: true },
        },
      },
      orderBy: [{ displayOrder: "asc" as const }, { sex: "asc" as const }, { id: "asc" as const }],
    },
    ...officialApplicationsForSession(sessionUserId),
  }) satisfies Prisma.CompetitionInclude;

/** スタートリストタブ用 */
const competitionPublicStartListInclude = (sessionUserId: string | null) =>
  ({
    ...orgAdminsForSession(sessionUserId),
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
    ...officialApplicationsForSession(sessionUserId),
  }) satisfies Prisma.CompetitionInclude;

export type CompetitionPublicShell = Prisma.CompetitionGetPayload<{
  include: ReturnType<typeof competitionPublicShellInclude>;
}>;

export type CompetitionPublicOverviewDetail = Prisma.CompetitionGetPayload<{
  include: ReturnType<typeof competitionPublicOverviewInclude>;
}>;

export type CompetitionPublicStartListDetail = Prisma.CompetitionGetPayload<{
  include: ReturnType<typeof competitionPublicStartListInclude>;
}>;

/** @deprecated 互換用。新規コードは shell / overview / startList を使う */
export type CompetitionPublicDetail = CompetitionPublicOverviewDetail;

function cachedAnonymousCompetitionQuery<T>(
  cacheKey: string,
  competitionId: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return unstable_cache(
    () => withPrismaPoolRetryOnce(fetcher),
    [cacheKey, competitionId],
    {
      revalidate: ANON_PUBLIC_REVALIDATE_SECONDS,
      tags: [competitionPublicPageTag(competitionId)],
    }
  )();
}

/** メタデータ・タブ制御向けの軽量行（1 キャッシュキーに統合して revalidate 時の接続を抑える） */
export const getCompetitionPublicLightMeta = cache(async (competitionId: string) => {
  return cachedAnonymousCompetitionQuery("competition-public-light-meta", competitionId, () =>
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true, dayOpsAccessSecretHash: true },
    })
  );
});

/** generateMetadata 用（session 不要） */
export const getCompetitionPublicName = cache(async (competitionId: string) => {
  const row = await getCompetitionPublicLightMeta(competitionId);
  return row ? { name: row.name } : null;
});

/** ログイン時のみ必要な org 管理者・オフィシャル応募（シェル/タブのキャッシュ本体とは分離） */
const loadSessionPublicCompetitionOverlay = cache(
  async (competitionId: string, organizationId: string, sessionUserId: string) => {
    const [orgAdmins, officialApplications] = await prisma.$transaction([
      prisma.orgAdmin.findMany({
        where: { organizationId, userId: sessionUserId },
        select: { role: true, userId: true },
      }),
      prisma.competitionOfficialApplication.findMany({
        where: { competitionId, userId: sessionUserId },
        select: { status: true, positionName: true, message: true },
        take: 1,
      }),
    ]);
    return { orgAdmins, officialApplications };
  }
);

function withSessionPublicCompetitionOverlay<
  T extends {
    organization: { admins: { role: unknown; userId: string }[] };
    officialApplications: unknown[];
  },
>(
  base: T,
  overlay: Awaited<ReturnType<typeof loadSessionPublicCompetitionOverlay>>
): T {
  return {
    ...base,
    organization: {
      ...base.organization,
      admins: overlay.orgAdmins,
    },
    officialApplications: overlay.officialApplications,
  };
}

async function loadCachedAnonymousCompetition<T>(
  cacheKey: string,
  competitionId: string,
  include: Prisma.CompetitionInclude
): Promise<T | null> {
  return cachedAnonymousCompetitionQuery(cacheKey, competitionId, () =>
    prisma.competition.findUnique({
      where: { id: competitionId },
      include,
    })
  ) as Promise<T | null>;
}

/** 公開大会ページのヘッダー・エントリー導線 */
export const loadCompetitionPublicShell = cache(
  async (competitionId: string, sessionUserId: string | null) => {
    const base = await loadCachedAnonymousCompetition<CompetitionPublicShell>(
      "competition-public-shell-anon",
      competitionId,
      competitionPublicShellInclude(null)
    );
    if (!base || sessionUserId === null) {
      return base;
    }
    const overlay = await loadSessionPublicCompetitionOverlay(
      competitionId,
      base.organizationId,
      sessionUserId
    );
    return withSessionPublicCompetitionOverlay(base, overlay);
  }
);

/** 大会ページタブ本体 */
export const loadCompetitionPublicOverviewDetail = cache(
  async (competitionId: string, sessionUserId: string | null) => {
    const base = await loadCachedAnonymousCompetition<CompetitionPublicOverviewDetail>(
      "competition-public-overview-anon",
      competitionId,
      competitionPublicOverviewInclude(null)
    );
    if (!base || sessionUserId === null) {
      return base;
    }
    const overlay = await loadSessionPublicCompetitionOverlay(
      competitionId,
      base.organizationId,
      sessionUserId
    );
    return withSessionPublicCompetitionOverlay(base, overlay);
  }
);

/** スタートリストタブ本体 */
export const loadCompetitionPublicStartListDetail = cache(
  async (competitionId: string, sessionUserId: string | null) => {
    const base = await loadCachedAnonymousCompetition<CompetitionPublicStartListDetail>(
      "competition-public-start-list-anon",
      competitionId,
      competitionPublicStartListInclude(null)
    );
    if (!base || sessionUserId === null) {
      return base;
    }
    const overlay = await loadSessionPublicCompetitionOverlay(
      competitionId,
      base.organizationId,
      sessionUserId
    );
    return withSessionPublicCompetitionOverlay(base, overlay);
  }
);

/** @deprecated loadCompetitionPublicOverviewDetail を使用 */
export const loadCompetitionPublicDetail = loadCompetitionPublicOverviewDetail;

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

/** ログイン時のクラブ一覧・問い合わせ氏名 */
export const loadSessionContextForPublicCompetition = cache(
  async (sessionUserId: string): Promise<SessionContextForPublicCompetition> => {
    const [sessionApprovedMemberships, sessionUserForInquiry] = await prisma.$transaction([
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
