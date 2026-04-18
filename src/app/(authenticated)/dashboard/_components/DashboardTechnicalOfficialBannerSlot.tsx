import ClubAdminTechnicalOfficialBanner from "@/components/ClubAdminTechnicalOfficialBanner";

export async function DashboardTechnicalOfficialBannerSlot({ userId }: { userId: string }) {
  return <ClubAdminTechnicalOfficialBanner userId={userId} />;
}
