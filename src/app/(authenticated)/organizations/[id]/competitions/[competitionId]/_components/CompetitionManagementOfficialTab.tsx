import { prisma } from "@/server/db";
import {
  OrgEditorialPanel,
  OrgSubheading,
} from "../../../_components/organizationEditorialUi";
import CompetitionOfficialSubTabsClient from "@/components/admin/CompetitionOfficialSubTabsClient";
import OfficialTabBadgesRow from "@/components/admin/OfficialTabBadgesRow";
import CompetitionOfficialManagePanel from "@/components/admin/CompetitionOfficialManagePanel";
import CompetitionOfficialDayOpsPanel from "@/components/admin/CompetitionOfficialDayOpsPanel";
import { getCachedQualificationTemplates } from "@/lib/qualificationTemplatesCache";
import { buildCompetitionOfficialSelect } from "@/lib/competitionManagementQueries";
import type { OfficialSubTabValue } from "@/lib/competitionManagementTab";

export default async function CompetitionManagementOfficialTab({
  organizationId,
  competitionId,
  userId,
  officialSub,
}: {
  organizationId: string;
  competitionId: string;
  userId: string;
  officialSub: OfficialSubTabValue;
}) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: buildCompetitionOfficialSelect(userId),
  });
  const qualificationTemplates = await getCachedQualificationTemplates();

  if (!competition) {
    return null;
  }

  const showOfficialRecruitment = competition.officialRecruitmentEnabled ?? true;
  const showTechnicalOfficialRecruitment =
    showOfficialRecruitment && (competition.technicalOfficialRecruitmentEnabled ?? true);
  const dayOpsUnlockConfigured = Boolean(competition.dayOpsAccessSecretHash);
  const canEdit = true;

  return (
    <CompetitionOfficialSubTabsClient officialSub={officialSub}>
      <OrgEditorialPanel accent="emerald">
        <OrgSubheading>Official</OrgSubheading>
        <h3 className="mt-1 text-base font-semibold text-foreground">オフィシャル管理</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          「管理」で募集の ON/OFF と資格・TO 人数、「当日運用」で暗号・応募・不足・出席をまとめます。上のサブタブは
          URL に同期されます。
        </p>
        <div className="mt-4 space-y-4">
          <OfficialTabBadgesRow
            competitionId={competitionId}
            showOfficialRecruitment={showOfficialRecruitment}
            showTechnicalOfficialRecruitment={showTechnicalOfficialRecruitment}
          />

          {officialSub === "manage" ? (
            <CompetitionOfficialManagePanel
              organizationId={organizationId}
              competitionId={competitionId}
              showOfficialRecruitment={showOfficialRecruitment}
              showTechnicalOfficialRecruitment={showTechnicalOfficialRecruitment}
              canEdit={canEdit}
              officialQualificationFilterEnabled={
                competition.officialQualificationFilterEnabled ?? false
              }
              requireClubMembership={competition.requireClubMembership ?? false}
              initialTiers={competition.technicalOfficialTiers}
              qualificationTemplates={qualificationTemplates}
            />
          ) : (
            <CompetitionOfficialDayOpsPanel
              organizationId={organizationId}
              competitionId={competitionId}
              competitionName={competition.name}
              showOfficialRecruitment={showOfficialRecruitment}
              showTechnicalOfficialRecruitment={showTechnicalOfficialRecruitment}
              canEdit={canEdit}
              dayOpsUnlockConfigured={dayOpsUnlockConfigured}
            />
          )}
        </div>
      </OrgEditorialPanel>

      {!showOfficialRecruitment ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-5 py-12 text-center">
          <p className="text-sm text-muted-foreground">現在はオフィシャル募集がOFFです。</p>
        </div>
      ) : null}
    </CompetitionOfficialSubTabsClient>
  );
}
