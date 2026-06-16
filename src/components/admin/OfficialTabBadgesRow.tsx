import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { loadOfficialApplicationCounts } from "@/lib/officialApplicationAdminData";

export default async function OfficialTabBadgesRow({
  competitionId,
  showOfficialRecruitment,
  showTechnicalOfficialRecruitment,
}: {
  competitionId: string;
  showOfficialRecruitment: boolean;
  showTechnicalOfficialRecruitment: boolean;
}) {
  const counts = await loadOfficialApplicationCounts(prisma, competitionId);

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={showOfficialRecruitment ? "default" : "secondary"}>
        オフィシャル募集: {showOfficialRecruitment ? "ON" : "OFF"}
      </Badge>
      <Badge variant={showTechnicalOfficialRecruitment ? "default" : "secondary"}>
        TO募集: {showTechnicalOfficialRecruitment ? "ON" : "OFF"}
      </Badge>
      {counts.pending > 0 ? (
        <Badge variant="outline">応募(審査中・旧): {counts.pending}件</Badge>
      ) : null}
      <Badge variant="outline">応募(受付済): {counts.approved}件</Badge>
      <Badge variant="outline">応募(却下): {counts.rejected}件</Badge>
      <Badge variant="outline">出席実績: {counts.attendance}件</Badge>
    </div>
  );
}
