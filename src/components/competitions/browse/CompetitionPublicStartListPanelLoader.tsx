import { notFound } from "next/navigation";
import { loadCompetitionPublicStartListDetail } from "@/lib/competitionPublicPageLoader";
import { fetchPaidEntryCountByEventId } from "@/lib/competitionStartListEntryCounts";
import {
  canEditCompetitionPublishedSchedule,
  canToggleCompetitionStartListVisibility,
} from "@/lib/competitionStartListAccess";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { sortEventsByScheduleTabs } from "@/lib/competitionScheduleTabDisplay";
import { getMarshalActiveRoundsForEvents } from "@/lib/marshalRoundSettingsLock";
import { prisma } from "@/server/db";
import { parseScheduleRowOrderByDayJson } from "@/lib/scheduleRowOrder";
import { firstCompetitionScheduleDayKey } from "@/lib/competitionScheduleDays";
import {
  StartListEventIndexBarsLazy,
  StartListVisibilityAdminControlsLazy,
} from "./competitionPublicDynamicClients";

type Props = {
  competitionId: string;
  sessionUserId: string | null;
  hasDayOpsUnlock: boolean;
};

export async function CompetitionPublicStartListPanelLoader({
  competitionId,
  sessionUserId,
  hasDayOpsUnlock,
}: Props) {
  const competition = await loadCompetitionPublicStartListDetail(competitionId, sessionUserId);

  if (!competition) {
    notFound();
  }

  const defaultScheduleDayKey = firstCompetitionScheduleDayKey(
    competition.startDate,
    competition.endDate
  );
  const scheduleTabsForPanel = competition.scheduleTabs.map((t) => ({
    id: t.id,
    name: t.name,
    displayOrder: t.displayOrder,
    scheduleRowOrder: parseScheduleRowOrderByDayJson(t.scheduleRowOrder, defaultScheduleDayKey),
  }));

  const orgAdminsForCurrentUser = competition.organization.admins;
  const isOrgAdmin = hasOrgAdminAccess(orgAdminsForCurrentUser);
  const canEditPublishedSchedule = canEditCompetitionPublishedSchedule({
    orgAdminsForCurrentUser,
    orgStatus: competition.organization.status,
  });
  const canToggleStartListVisibility = canToggleCompetitionStartListVisibility({
    orgAdminsForCurrentUser,
    orgStatus: competition.organization.status,
  });
  const canViewStartListOnPublicPage =
    (competition.startListPubliclyVisible ?? true) || isOrgAdmin || hasDayOpsUnlock;

  const eventsForStartListPanel = sortEventsByScheduleTabs(
    competition.events,
    scheduleTabsForPanel
  );

  const [startListEntryCountByEventId, marshalLockedRoundsByEventId] = await Promise.all([
    competition.events.length > 0
      ? fetchPaidEntryCountByEventId(
          competitionId,
          competition.events.map((e) => ({ id: e.id, type: e.type }))
        )
      : Promise.resolve({} as Record<string, number>),
    competition.events.length > 0
      ? getMarshalActiveRoundsForEvents(
          prisma,
          competitionId,
          competition.events.map((e) => e.id)
        )
      : Promise.resolve(new Map<string, Set<"HEAT" | "SEMI" | "FINAL">>()),
  ]);

  return (
    <>
      <div className="flex justify-end">
        <StartListVisibilityAdminControlsLazy
          canManage={canToggleStartListVisibility}
          organizationId={competition.organizationId}
          competitionId={competitionId}
          initialVisible={competition.startListPubliclyVisible ?? true}
        />
      </div>
      {canViewStartListOnPublicPage ? (
        <StartListEventIndexBarsLazy
          competitionId={competition.id}
          competitionName={competition.name}
          competitionStartDate={competition.startDate}
          competitionEndDate={competition.endDate}
          scheduleTabs={scheduleTabsForPanel}
          events={eventsForStartListPanel.map((event) => ({
            id: event.id,
            name: event.name,
            sex: event.sex,
            type: event.type,
            displayOrder: event.displayOrder,
            ageCategoryId: event.ageCategory?.id ?? null,
            ageCategoryName: event.ageCategory?.name ?? null,
            ageCategoryDisplayOrder: event.ageCategory?.displayOrder ?? null,
            scheduledStartAt: event.scheduledStartAt,
            roundScheduledStarts: event.roundScheduledStarts,
            scheduledEndAt: event.scheduledEndAt,
            startListRoundCount: event.startListRoundCount,
            scheduleTabId: event.scheduleTabId,
            scheduleTabSortOrder: event.scheduleTabSortOrder,
            entryCount: startListEntryCountByEventId[event.id] ?? 0,
            preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
            startListHeatPlanConfirmedAt: event.startListHeatPlanConfirmedAt,
            marshalStartedAt: event.marshalStartedAt,
            marshalLockedRounds: [...(marshalLockedRoundsByEventId.get(event.id) ?? new Set())],
          }))}
          initialStartListSettings={competition.startListSettings}
          canReorder={canEditPublishedSchedule}
          canEditSchedule={canEditPublishedSchedule}
          canEditRoundCount={canEditPublishedSchedule}
        />
      ) : (
        <p className="rounded-lg border border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          この大会のスタートリスト全体が主催の設定により非公開です（タイムスケジュールと全種目のリスト）。主催管理者または当日運用でアンロックした端末から閲覧・編集できます。
        </p>
      )}
    </>
  );
}
