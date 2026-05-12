import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { OfficialSettingsEditor } from "@/components/OfficialSettingsEditor";
import TechnicalOfficialShortagePanel from "@/components/TechnicalOfficialShortagePanel";
import TechnicalOfficialSettingsEditor from "@/components/TechnicalOfficialSettingsEditor";
import OfficialAttendanceSection from "@/components/OfficialAttendanceSection";
import OfficialApplicationsCsvExportButton, {
  type OfficialApplicationsCsvRow,
} from "@/components/OfficialApplicationsCsvExportButton";
import OfficialAttendancesCsvExportButton, {
  type OfficialAttendancesCsvRow,
} from "@/components/OfficialAttendancesCsvExportButton";
import CompetitionDayOpsPassphraseEditor from "@/components/CompetitionDayOpsPassphraseEditor";
import { listTechnicalOfficialShortagesForCompetition } from "@/lib/technicalOfficialQueries";
import { TabsContent } from "@/components/ui/tabs";
import type { OfficialSubTabValue } from "@/lib/competitionManagementTab";
import { OfficialRecruitmentToggleButton } from "@/components/OfficialRecruitmentToggleButton";
import { TechnicalOfficialRecruitmentToggleButton } from "@/components/TechnicalOfficialRecruitmentToggleButton";

/** 同一ファイル内に置き Turbopack の RSC チャンク不整合（module factory is not available）を避ける */
async function CompetitionOfficialShortagePanelDeferred({
  competitionId,
}: {
  competitionId: string;
}) {
  const rows = await listTechnicalOfficialShortagesForCompetition(prisma, competitionId);
  return <TechnicalOfficialShortagePanel rows={rows} />;
}

type QualificationTemplateLite = { id: string; name: string; kind: string };

const officialStatusLabel = {
  PENDING: "審査中",
  APPROVED: "受付済",
  REJECTED: "却下",
} as const;

export default async function CompetitionOfficialTabHeavy({
  /** URL のタブが official のときだけ true。false なら DB に触れずプレースホルダのみ（他タブ表示時の無駄取得を防ぐ） */
  enabled,
  officialSub,
  organizationId,
  competitionId,
  competitionName,
  showOfficialRecruitment,
  showTechnicalOfficialRecruitment,
  canEdit,
  dayOpsUnlockConfigured,
  officialQualificationFilterEnabled,
  requireClubMembership,
  initialTiers,
  competitionType,
  qualificationTemplates,
}: {
  enabled: boolean;
  officialSub: OfficialSubTabValue;
  organizationId: string;
  competitionId: string;
  competitionName: string;
  showOfficialRecruitment: boolean;
  showTechnicalOfficialRecruitment: boolean;
  canEdit: boolean;
  dayOpsUnlockConfigured: boolean;
  officialQualificationFilterEnabled: boolean;
  requireClubMembership: boolean;
  initialTiers: unknown;
  competitionType: string | null;
  qualificationTemplates: QualificationTemplateLite[];
}) {
  if (!enabled) {
    return (
      <>
        <TabsContent value="manage" className="hidden" />
        <TabsContent value="dayops" className="hidden" />
      </>
    );
  }

  const dayOpsDataReady = officialSub === "dayops";

  let officialApplications: Array<{
    id: string;
    createdAt: Date;
    status: string;
    positionName: string;
    message: string | null;
    user: {
      familyName: string;
      givenName: string;
      email: string | null;
      phoneNumber: string | null;
    };
  }> = [];

  let officialAttendances: Array<{
    attendanceDate: Date;
    method: string;
    user: {
      familyName: string;
      givenName: string;
      email: string | null;
      phoneNumber: string | null;
    };
  }> = [];

  let officialPendingCount = 0;
  let officialApprovedCount = 0;
  let officialRejectedCount = 0;
  let officialAttendanceCount = 0;

  if (dayOpsDataReady) {
    const [apps, atts] = await Promise.all([
      prisma.competitionOfficialApplication.findMany({
        where: { competitionId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          status: true,
          positionName: true,
          message: true,
          user: {
            select: {
              familyName: true,
              givenName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      }),
      prisma.competitionOfficialAttendance.findMany({
        where: { competitionId },
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        select: {
          attendanceDate: true,
          method: true,
          user: {
            select: {
              familyName: true,
              givenName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      }),
    ]);
    officialApplications = apps;
    officialAttendances = atts;
    officialPendingCount = apps.filter((a) => a.status === "PENDING").length;
    officialApprovedCount = apps.filter((a) => a.status === "APPROVED").length;
    officialRejectedCount = apps.filter((a) => a.status === "REJECTED").length;
    officialAttendanceCount = atts.length;
  } else {
    const [pending, approved, rejected, attendanceTotal] = await Promise.all([
      prisma.competitionOfficialApplication.count({
        where: { competitionId, status: "PENDING" },
      }),
      prisma.competitionOfficialApplication.count({
        where: { competitionId, status: "APPROVED" },
      }),
      prisma.competitionOfficialApplication.count({
        where: { competitionId, status: "REJECTED" },
      }),
      prisma.competitionOfficialAttendance.count({ where: { competitionId } }),
    ]);
    officialPendingCount = pending;
    officialApprovedCount = approved;
    officialRejectedCount = rejected;
    officialAttendanceCount = attendanceTotal;
  }

  const officialApplicationsCsvRows: OfficialApplicationsCsvRow[] = officialApplications.map(
    (application) => ({
      応募日時: application.createdAt.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      応募状態:
        officialStatusLabel[application.status as keyof typeof officialStatusLabel] ??
        application.status,
      氏名: `${application.user.familyName} ${application.user.givenName}`,
      メールアドレス: application.user.email ?? "",
      電話番号: application.user.phoneNumber ?? "",
      希望ポジション: application.positionName,
      応募メッセージ: application.message?.trim() || "",
    })
  );

  const competitionTypeLabel =
    competitionType === "A" ? "A級" : competitionType === "B" ? "B級" : "未設定";
  const attendanceCountAdditionLabel =
    competitionType === "A" ? "1.0" : competitionType === "B" ? "0.5" : "0.0";

  const officialAttendancesCsvRows: OfficialAttendancesCsvRow[] = officialAttendances.map(
    (attendance) => ({
      出席日: attendance.attendanceDate.toLocaleDateString("ja-JP"),
      氏名: `${attendance.user.familyName} ${attendance.user.givenName}`,
      メールアドレス: attendance.user.email ?? "",
      電話番号: attendance.user.phoneNumber ?? "",
      出席方法: attendance.method === "NFC" ? "NFC" : "手動",
      大会種別: competitionTypeLabel,
      カウント追加分: attendanceCountAdditionLabel,
    })
  );

  const manageContent = (
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

  const dayOpsContent = (
    <>
      <CompetitionDayOpsPassphraseEditor
        organizationId={organizationId}
        competitionId={competitionId}
        canEdit={canEdit}
        initiallyConfigured={dayOpsUnlockConfigured}
      />

      {showOfficialRecruitment ? (
        <>
          <section className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">オフィシャル応募</h2>
              <p className="text-xs text-muted-foreground">
                CSV で一括出力するか、下の一覧で内容を確認できます。
              </p>
            </div>
            {dayOpsDataReady ? (
              <>
                <OfficialApplicationsCsvExportButton
                  rows={officialApplicationsCsvRows}
                  fileNameBase={`${competitionName}_オフィシャル応募一覧`}
                />
                <details className="rounded-lg border border-border/70 bg-muted/15">
                  <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                    応募一覧を表示・非表示
                  </summary>
                  <div className="max-h-[min(24rem,50vh)] overflow-auto border-t border-border/60">
                    <table className="w-full min-w-[20rem] border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 font-medium">応募日時</th>
                          <th className="px-2 py-2 font-medium">状態</th>
                          <th className="px-2 py-2 font-medium">氏名</th>
                          <th className="px-2 py-2 font-medium">希望ポジション</th>
                        </tr>
                      </thead>
                      <tbody>
                        {officialApplications.length === 0 ? (
                          <tr>
                            <td className="px-2 py-4 text-muted-foreground" colSpan={4}>
                              応募はまだありません。
                            </td>
                          </tr>
                        ) : (
                          officialApplications.map((application) => (
                            <tr
                              key={application.id}
                              className="border-b border-border/40 last:border-0"
                            >
                              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                                {application.createdAt.toLocaleString("ja-JP", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5">
                                {officialStatusLabel[
                                  application.status as keyof typeof officialStatusLabel
                                ] ?? application.status}
                              </td>
                              <td className="px-2 py-1.5">
                                {application.user.familyName} {application.user.givenName}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {application.positionName}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p
                className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                当日運用の応募一覧を読み込んでいます。数秒お待ちください。
              </p>
            )}
          </section>

          {showTechnicalOfficialRecruitment ? (
            dayOpsDataReady ? (
              <details className="rounded-xl border border-border/70 bg-background">
                <summary className="cursor-pointer select-none border-b border-transparent px-3 py-3 text-sm font-semibold text-foreground hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
                  不足クラブの確認（開いて表示）
                </summary>
                <div className="space-y-2 border-t border-border/60 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    現在のエントリー状況に基づく不足人数を表示します。
                  </p>
                  <Suspense
                    fallback={
                      <div
                        className="flex min-h-[4rem] flex-col justify-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                        role="status"
                        aria-live="polite"
                      >
                        <div
                          className="h-6 max-w-[10rem] animate-pulse rounded bg-muted-foreground/15"
                          aria-hidden
                        />
                        <p className="text-xs text-muted-foreground">不足人数を集計しています…</p>
                      </div>
                    }
                  >
                    <CompetitionOfficialShortagePanelDeferred competitionId={competitionId} />
                  </Suspense>
                </div>
              </details>
            ) : (
              <p
                className="rounded-xl border border-border/70 bg-muted/15 px-3 py-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                不足クラブのデータを読み込んでいます。数秒お待ちください。
              </p>
            )
          ) : null}

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

          <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">出席実績CSV出力</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  提出・集計用途向けに出席実績をCSVで出力できます。
                </p>
              </div>
              {dayOpsDataReady ? (
                <OfficialAttendancesCsvExportButton
                  rows={officialAttendancesCsvRows}
                  fileNameBase={`${competitionName}_当日出席オフィシャル一覧`}
                />
              ) : (
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                  読み込み中…
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              現在の大会種別: {competitionTypeLabel} / 1出席あたりの加算:{" "}
              {attendanceCountAdditionLabel}
            </p>
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
          オフィシャル募集を ON にすると、応募一覧・不足確認・当日出席のブロックが表示されます。
        </p>
      )}
    </>
  );

  const badgesRow = (
    <div className="flex flex-wrap gap-2">
      <Badge variant={showOfficialRecruitment ? "default" : "secondary"}>
        オフィシャル募集: {showOfficialRecruitment ? "ON" : "OFF"}
      </Badge>
      <Badge variant={showTechnicalOfficialRecruitment ? "default" : "secondary"}>
        TO募集: {showTechnicalOfficialRecruitment ? "ON" : "OFF"}
      </Badge>
      {officialPendingCount > 0 ? (
        <Badge variant="outline">応募(審査中・旧): {officialPendingCount}件</Badge>
      ) : null}
      <Badge variant="outline">応募(受付済): {officialApprovedCount}件</Badge>
      <Badge variant="outline">応募(却下): {officialRejectedCount}件</Badge>
      <Badge variant="outline">出席実績: {officialAttendanceCount}件</Badge>
    </div>
  );

  return (
    <>
      {badgesRow}
      <TabsContent value="manage" className="mt-4 min-w-0 space-y-4 outline-none">
        {manageContent}
      </TabsContent>
      <TabsContent value="dayops" className="mt-4 min-w-0 space-y-4 outline-none">
        {dayOpsContent}
      </TabsContent>
    </>
  );
}
