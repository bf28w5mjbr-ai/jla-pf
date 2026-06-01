"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StartListSchedulePublicView,
  type PublicScheduleTabLite,
  type PublicScheduleViewSection,
} from "@/components/StartListSchedulePublicView";

type Props = {
  competitionId: string;
  competitionName: string;
  sections: PublicScheduleViewSection[];
  scheduleTabCount: number;
  scheduleTabs: PublicScheduleTabLite[];
  roundCounts: Record<string, string>;
};

export function CompetitionPublicResultsTimetable({
  competitionId,
  competitionName,
  sections,
  scheduleTabCount,
  scheduleTabs,
  roundCounts,
}: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/80 bg-muted/15 px-3 py-2.5 sm:px-4">
        <CardTitle className="text-sm font-semibold">タイムテーブル</CardTitle>
        {competitionName ? (
          <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
        ) : null}
      </CardHeader>
      <CardContent className="px-0 py-0 sm:px-0">
        <StartListSchedulePublicView
          competitionId={competitionId}
          sections={sections}
          scheduleTabCount={scheduleTabCount}
          scheduleTabs={scheduleTabs}
          roundCounts={roundCounts}
          scheduleHintText="開催日・エリアごとにタイムスケジュールを表示しています。行をタップすると種目の競技結果を表示します。"
          getRowHref={({ eventId, roundIndex }) => {
            const base = `/competitions/${competitionId}/results/${eventId}`;
            return `${base}?roundIndex=${roundIndex}`;
          }}
        />
      </CardContent>
    </Card>
  );
}
