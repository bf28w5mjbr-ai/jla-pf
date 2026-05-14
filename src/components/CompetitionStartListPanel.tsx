import StartListEventIndexBars from "@/components/StartListEventIndexBars";

type Props = {
  competition: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    events: Array<{
      id: string;
      name: string;
      sex: string;
      type: "INDIVIDUAL" | "TEAM";
      displayOrder: number;
      ageCategoryId?: string | null;
      ageCategoryName?: string | null;
      scheduledStartAt?: Date | null;
      /** ラウンド別の想定開始（DB JSON） */
      roundScheduledStarts?: unknown;
      scheduledEndAt?: Date | null;
      startListRoundCount?: number;
      scheduleTabId?: string | null;
      scheduleTabSortOrder?: number | null;
      /** 確定エントリー相当の件数（スタートリストのラウンド設定用） */
      entryCount?: number;
      preliminaryHeatLaneCount?: number | null;
      startListHeatPlanConfirmedAt?: Date | null;
      marshalStartedAt?: Date | null;
    }>;
  };
  /** タイムスケジュール用タブ（大会単位・表示順） */
  scheduleTabs: Array<{ id: string; name: string; displayOrder: number }>;
  /** 大会の startListSettings JSON（ラウンド別ヒート／レーン編集用） */
  initialStartListSettings?: unknown;
  /** 大会主催者の管理者、または承認済みオフィシャルのみ並べ替え可 */
  canEditStartListSplit?: boolean;
  /** 主催者管理者または承認済みオフィシャル: 種目一覧から開始時刻を編集可 */
  canEditEventSchedule?: boolean;
  /** 主催者管理者または承認済みオフィシャル: 種目一覧からラウンド数を編集可 */
  canEditStartListRoundCount?: boolean;
};

export default async function CompetitionStartListPanel({
  competition,
  scheduleTabs,
  initialStartListSettings = null,
  canEditStartListSplit = false,
  canEditEventSchedule = false,
  canEditStartListRoundCount = false,
}: Props) {
  return (
    <StartListEventIndexBars
      competitionId={competition.id}
      competitionName={competition.name}
      competitionStartDate={competition.startDate}
      competitionEndDate={competition.endDate}
      scheduleTabs={scheduleTabs}
      events={competition.events}
      initialStartListSettings={initialStartListSettings}
      canReorder={canEditStartListSplit}
      canEditSchedule={canEditEventSchedule}
      canEditRoundCount={canEditStartListRoundCount}
    />
  );
}
