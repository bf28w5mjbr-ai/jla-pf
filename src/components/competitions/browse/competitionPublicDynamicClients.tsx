import dynamic from "next/dynamic";
import { CompetitionPublicClientBlockSkeleton } from "./CompetitionPublicPageSkeleton";

export const CompetitionRelationsEditorLazy = dynamic(
  () => import("@/components/CompetitionRelationsEditor"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-24" />,
  }
);

export const CompetitionAnnouncementsManagerLazy = dynamic(
  () => import("@/components/CompetitionAnnouncementsManager"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-32" />,
  }
);

export const CompetitionAttachmentsManagerLazy = dynamic(
  () => import("@/components/CompetitionAttachmentsManager"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-24" />,
  }
);

export const CompetitionPublicGalleryLazy = dynamic(
  () => import("@/components/CompetitionPublicGallery"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-40" />,
  }
);

export const CompetitionHostInquiryDialogLazy = dynamic(
  () =>
    import("@/components/public/CompetitionHostInquiryDialog").then((m) => ({
      default: m.CompetitionHostInquiryDialog,
    })),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-9 w-28" />,
  }
);

export const DayOpsUnlockBannerLazy = dynamic(
  () => import("@/components/DayOpsUnlockBanner"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="h-12" />,
  }
);

export const StartListEventIndexBarsLazy = dynamic(
  () => import("@/components/StartListEventIndexBars"),
  {
    loading: () => <CompetitionPublicClientBlockSkeleton className="min-h-[240px]" />,
  }
);

export const StartListVisibilityAdminControlsLazy = dynamic(
  () =>
    import("@/components/StartListVisibilityAdminControls").then((m) => ({
      default: m.StartListVisibilityAdminControls,
    })),
  {
    loading: () => null,
  }
);
