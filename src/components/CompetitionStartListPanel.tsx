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
      scheduledStartAt?: Date | null;
      scheduledEndAt?: Date | null;
      startListRoundCount?: number;
    }>;
  };
  /** 大会主催者の管理者、または承認済みオフィシャルのみ並べ替え可 */
  canEditStartListSplit?: boolean;
  /** 主催者管理者または承認済みオフィシャル: 種目一覧から開始時刻を編集可 */
  canEditEventSchedule?: boolean;
  /** 主催者管理者または承認済みオフィシャル: 種目一覧からラウンド数を編集可 */
  canEditStartListRoundCount?: boolean;
};

export default async function CompetitionStartListPanel({
  competition,
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
      events={competition.events}
      canReorder={canEditStartListSplit}
      canEditSchedule={canEditEventSchedule}
      canEditRoundCount={canEditStartListRoundCount}
    />
  );
}
