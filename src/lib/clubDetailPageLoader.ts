import { cache } from "react";
import { redirect } from "next/navigation";
import { redirectUnlessCanViewClubDetail } from "@/lib/clubAccess";
import {
  countClubMembershipsByStatus,
  loadClubRepresentativeMemberOptions,
} from "@/lib/clubMembersTabLoader";
import { isClubAdminRole } from "@/lib/roleScopes";
import { appRoutes } from "@/lib/appRoutes";
import { prisma } from "@/server/db";

export const loadClubDetailPageData = cache(async (clubId: string, userId: string) => {
  await redirectUnlessCanViewClubDetail(clubId, userId);

  const [club, userMembership, membershipCounts] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      include: {
        creator: {
          select: {
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
    }),
    prisma.membership.findFirst({
      where: { clubId, userId },
      select: { id: true, userId: true, role: true, status: true },
    }),
    countClubMembershipsByStatus(clubId),
  ]);

  if (!club) {
    redirect(appRoutes.clubs.list());
  }

  const isClubAdmin = !!(userMembership && isClubAdminRole(userMembership.role));
  const representativeMemberOptions = isClubAdmin
    ? await loadClubRepresentativeMemberOptions(clubId)
    : [];

  return {
    club,
    userMembership,
    approvedMemberCount: membershipCounts.approved,
    isClubAdmin,
    representativeMemberOptions,
    userId,
  };
});

export const CLUB_STATUS_LABEL = {
  APPROVED: "運用中",
  SUSPENDED: "停止中",
  APPLYING: "（旧）申請中",
  JLA_APPROVED: "（旧）審査通過",
  INACTIVE: "（旧）無効",
} as const;

export const CLUB_STATUS_BADGE_CLASS = {
  APPROVED:
    "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  SUSPENDED:
    "border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
  APPLYING:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  JLA_APPROVED:
    "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100",
  INACTIVE: "border-border bg-muted text-muted-foreground",
} as const;
