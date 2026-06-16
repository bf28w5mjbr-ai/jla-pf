import { OfficialSettingsEditor } from "@/components/OfficialSettingsEditor";
import TechnicalOfficialSettingsEditor from "@/components/TechnicalOfficialSettingsEditor";
import { OfficialRecruitmentToggleButton } from "@/components/OfficialRecruitmentToggleButton";
import { TechnicalOfficialRecruitmentToggleButton } from "@/components/TechnicalOfficialRecruitmentToggleButton";
import type { QualificationTemplateLite } from "@/lib/qualificationTemplatesCache";

export default function CompetitionOfficialManagePanel({
  organizationId,
  competitionId,
  showOfficialRecruitment,
  showTechnicalOfficialRecruitment,
  canEdit,
  officialQualificationFilterEnabled,
  requireClubMembership,
  initialTiers,
  qualificationTemplates,
}: {
  organizationId: string;
  competitionId: string;
  showOfficialRecruitment: boolean;
  showTechnicalOfficialRecruitment: boolean;
  canEdit: boolean;
  officialQualificationFilterEnabled: boolean;
  requireClubMembership: boolean;
  initialTiers: unknown;
  qualificationTemplates: QualificationTemplateLite[];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">オフィシャル募集</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                大会ページからのオフィシャル応募を許可します。
              </p>
            </div>
            <OfficialRecruitmentToggleButton
              organizationId={organizationId}
              competitionId={competitionId}
              initialEnabled={showOfficialRecruitment}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">TO募集</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                テクニカルオフィシャル募集と必要人数計算を有効化します。
              </p>
            </div>
            <TechnicalOfficialRecruitmentToggleButton
              organizationId={organizationId}
              competitionId={competitionId}
              initialEnabled={showTechnicalOfficialRecruitment}
              disabled={!showOfficialRecruitment}
            />
          </div>
        </div>
      </div>

      {showOfficialRecruitment ? (
        <section className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">1. オフィシャル資格要件・TO設定</h2>
            <p className="text-xs text-muted-foreground">
              応募資格フィルタ、資格テンプレート、クラブごとのTO必要人数を設定します。
            </p>
          </div>
          <OfficialSettingsEditor
            competitionId={competitionId}
            organizationId={organizationId}
            initialEnabled={officialQualificationFilterEnabled}
            templates={qualificationTemplates}
          />

          {showTechnicalOfficialRecruitment ? (
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="rounded-lg border border-border/70 bg-background p-3">
                <h3 className="text-sm font-semibold text-foreground">TO必要人数設定</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  個人エントリー件数の閾値ごとに必要人数を定義します。
                </p>
                <div className="mt-3">
                  <TechnicalOfficialSettingsEditor
                    organizationId={organizationId}
                    competitionId={competitionId}
                    canEdit={canEdit}
                    requireClubMembership={requireClubMembership}
                    initialTiers={initialTiers}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-4 text-xs text-muted-foreground">
              TO募集がOFFのため、TO必要人数設定は表示されません。不足の確認は「当日運用」で TO 募集 ON
              のときに利用できます。
            </div>
          )}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
          オフィシャル募集を ON にすると、資格フィルタや TO 人数の設定が表示されます。
        </p>
      )}
    </>
  );
}
