"use client";

import { useState } from "react";
import { Building2, ChevronRight, User, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CompetitionEntryCsvExportControls from "@/components/admin/CompetitionEntryCsvExportControls";
import {
  IndividualEntriesResponsive,
  TeamEntryGroupsResponsive,
  type IndividualEntryListRow,
  type TeamEntryGroupListRow,
} from "@/components/admin/competitionEntriesListViews";
import { OrgEditorialPanel } from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import { CSV_EXPORT_SCOPE } from "@/lib/competitionEntryCsvExport";
import { cn } from "@/lib/utils";

type AgeCategoryCount = {
  id: string;
  name: string;
  count: number;
};

type CsvExportProps = {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  fileNameBase: string;
  hasPending: boolean;
  hasActiveApproval: boolean;
};

type Props = {
  competitionId: string;
  individualEntryCount: number;
  teamEntryCount: number;
  entryClubCount: number | null;
  ageCategoryCounts: AgeCategoryCount[] | null;
  ageCategoryUncategorizedCount: number;
  paidIndividualRows: IndividualEntryListRow[];
  teamGroupRows: TeamEntryGroupListRow[];
  individualCsv: CsvExportProps;
  teamCsv: CsvExportProps;
};

const statShellClass =
  "inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/75 px-2.5 py-1.5";

function SummaryStatButton({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof User;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        statShellClass,
        "group/stat transition-colors hover:border-primary/30 hover:bg-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      )}
      aria-label={`${label}エントリー ${value}件 — 詳細を表示`}
    >
      <Icon className="size-3.5 shrink-0 text-primary/80" strokeWidth={1.75} aria-hidden />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>
      <ChevronRight
        className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover/stat:translate-x-0.5 group-hover/stat:text-foreground"
        aria-hidden
      />
    </button>
  );
}

function SummaryStatDisplay({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className={cn(statShellClass, "bg-muted/20")}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}

export default function CompetitionEntriesSummaryPanel({
  competitionId,
  individualEntryCount,
  teamEntryCount,
  entryClubCount,
  ageCategoryCounts,
  ageCategoryUncategorizedCount,
  paidIndividualRows,
  teamGroupRows,
  individualCsv,
  teamCsv,
}: Props) {
  const [individualOpen, setIndividualOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const ageCategoryItems =
    ageCategoryCounts?.map((c) => ({ key: c.id, label: c.name, count: c.count })) ?? [];
  if (ageCategoryUncategorizedCount > 0) {
    ageCategoryItems.push({
      key: "__uncategorized",
      label: "未該当",
      count: ageCategoryUncategorizedCount,
    });
  }

  const hasAgeCategories = ageCategoryCounts != null && ageCategoryCounts.length > 0;

  return (
    <>
      <OrgEditorialPanel accent="orange" className="!px-3 !py-2.5 sm:!px-4 sm:!py-3">
        <div
          className="flex flex-col gap-2"
          aria-labelledby="competition-entries-summary-title"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3
              id="competition-entries-summary-title"
              className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              エントリー集計
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <SummaryStatButton
                label="個人"
                value={individualEntryCount}
                icon={User}
                onClick={() => setIndividualOpen(true)}
              />
              <SummaryStatButton
                label="チーム"
                value={teamEntryCount}
                icon={Users}
                onClick={() => setTeamOpen(true)}
              />
              {entryClubCount != null ? (
                <SummaryStatDisplay label="クラブ" value={entryClubCount} icon={Building2} />
              ) : null}
            </div>
          </div>

          {hasAgeCategories ? (
            <p className="border-t border-border/40 pt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mr-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                AGE
              </span>
              {ageCategoryItems.length > 0 ? (
                ageCategoryItems.map((item, i) => (
                  <span key={item.key}>
                    {i > 0 ? <span className="mx-1.5 text-border">·</span> : null}
                    <span className="font-medium text-foreground/90">{item.label}</span>{" "}
                    <span className="tabular-nums">{item.count}</span>
                  </span>
                ))
              ) : (
                "該当者なし"
              )}
            </p>
          ) : null}
        </div>
      </OrgEditorialPanel>

      <Dialog open={individualOpen} onOpenChange={setIndividualOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-5 pr-12">
            <DialogTitle>個人エントリー（{individualEntryCount} 件）</DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed">
              氏名・所属クラブ・出場種目の一覧です。詳細は PF 管理者承認後の CSV で確認できます。
              後払い入金待ちも含みます（入金操作は要対応セクションから行えます）。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,640px)] space-y-4 overflow-y-auto px-6 py-5">
            <CompetitionEntryCsvExportControls
              competitionId={competitionId}
              scope={CSV_EXPORT_SCOPE.INDIVIDUAL}
              csvHeaders={individualCsv.headers}
              csvRows={individualCsv.rows}
              fileNameBase={individualCsv.fileNameBase}
              hasPending={individualCsv.hasPending}
              hasActiveApproval={individualCsv.hasActiveApproval}
            />
            <IndividualEntriesResponsive
              rows={paidIndividualRows}
              emptyMessage="個人エントリーはまだありません。"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-5 pr-12">
            <DialogTitle>チームエントリー（{teamEntryCount} 件）</DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed">
              クラブ・種目ごとのチーム数です。メンバー詳細は CSV に含まれます（承認後にダウンロード）。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,640px)] space-y-4 overflow-y-auto px-6 py-5">
            <CompetitionEntryCsvExportControls
              competitionId={competitionId}
              scope={CSV_EXPORT_SCOPE.TEAM}
              csvHeaders={teamCsv.headers}
              csvRows={teamCsv.rows}
              fileNameBase={teamCsv.fileNameBase}
              hasPending={teamCsv.hasPending}
              hasActiveApproval={teamCsv.hasActiveApproval}
            />
            <TeamEntryGroupsResponsive
              rows={teamGroupRows}
              emptyMessage="チームエントリーはまだありません。"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
