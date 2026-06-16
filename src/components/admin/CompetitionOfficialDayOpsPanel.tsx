import CompetitionDayOpsPassphraseEditor from "@/components/CompetitionDayOpsPassphraseEditor";
import OfficialAttendanceSection from "@/components/OfficialAttendanceSection";
import OfficialDayOpsClientPanel from "@/components/admin/OfficialDayOpsClientPanel";

export default function CompetitionOfficialDayOpsPanel({
  organizationId,
  competitionId,
  competitionName,
  showOfficialRecruitment,
  showTechnicalOfficialRecruitment,
  canEdit,
  dayOpsUnlockConfigured,
}: {
  organizationId: string;
  competitionId: string;
  competitionName: string;
  showOfficialRecruitment: boolean;
  showTechnicalOfficialRecruitment: boolean;
  canEdit: boolean;
  dayOpsUnlockConfigured: boolean;
}) {
  return (
    <>
      <CompetitionDayOpsPassphraseEditor
        organizationId={organizationId}
        competitionId={competitionId}
        canEdit={canEdit}
        initiallyConfigured={dayOpsUnlockConfigured}
      />

      {showOfficialRecruitment ? (
        <>
          <OfficialDayOpsClientPanel
            organizationId={organizationId}
            competitionId={competitionId}
            competitionName={competitionName}
            showTechnicalOfficialRecruitment={showTechnicalOfficialRecruitment}
          />

          <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">当日出席確認</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                当日の出席記録を登録・更新し、出席人数の集計・CSV 出力に利用します（当日運用の操作権限とは連動しません）。
              </p>
            </div>
            <OfficialAttendanceSection
              organizationId={organizationId}
              competitionId={competitionId}
              canEdit={canEdit}
              compact
            />
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
          オフィシャル募集を ON にすると、応募一覧・不足確認・当日出席のブロックが表示されます。
        </p>
      )}
    </>
  );
}
