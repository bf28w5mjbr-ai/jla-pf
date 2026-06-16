import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { ClubEditorialLoadingState } from "@/components/clubEditorialUi";

function ClubClientBlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg border border-border/60 bg-muted/25", className)} aria-hidden />
  );
}

export const ClubLogoUploadLazy = dynamic(() => import("@/components/ClubLogoUpload"), {
  loading: () => <ClubClientBlockSkeleton className="h-16 w-16 rounded-lg" />,
});

export const ClubRepresentativeSelectorLazy = dynamic(
  () => import("@/components/ClubRepresentativeSelector"),
  { loading: () => <ClubClientBlockSkeleton className="h-5 w-32" /> }
);

export const LeaveClubButtonLazy = dynamic(() => import("@/components/LeaveClubButton"), {
  loading: () => <ClubClientBlockSkeleton className="h-9 w-24" />,
});

export const ClubAnnouncementsLazy = dynamic(() => import("@/components/ClubAnnouncements"), {
  loading: () => <ClubEditorialLoadingState label="お知らせを読み込み中" />,
});

export const ClubActivitiesLazy = dynamic(() => import("@/components/ClubActivities"), {
  loading: () => <ClubEditorialLoadingState label="活動記録を読み込み中" />,
});

export const MemberActionsLazy = dynamic(() => import("@/components/MemberActions"), {
  loading: () => <ClubClientBlockSkeleton className="h-8 w-20" />,
});

export const ClubTechnicalOfficialRowLazy = dynamic(
  () => import("@/components/ClubTechnicalOfficialRow"),
  { loading: () => <ClubClientBlockSkeleton className="h-24" /> }
);
