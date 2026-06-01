import { notFound } from "next/navigation";
import {
  buildScheduleRoundRowsFromKeys,
  parseScheduleRoundCountDraft,
  sortEventsByScheduleTabs,
} from "@/lib/competitionScheduleTabDisplay";
import {
  enumerateCompetitionScheduleDays,
  firstCompetitionScheduleDayKey,
} from "@/lib/competitionScheduleDays";
import { loadCompetitionPublicStartListDetail } from "@/lib/competitionPublicPageLoader";
import {
  buildScheduleDayAreaPartition,
  buildPublicScheduleSections,
  parseScheduleRowOrderByDayJson,
  roundCountForEvent,
} from "@/lib/scheduleRowOrder";
import { parseStartListSettings, type HeatSetting } from "@/lib/startListSettings";
import type { PublicScheduleViewSection } from "@/components/StartListSchedulePublicView";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";

export type CompetitionPublicResultsTimetableData = {
  competitionId: string;
  competitionName: string;
  sections: PublicScheduleViewSection[];
  scheduleTabCount: number;
  roundCounts: Record<string, string>;
};

function mapEventToBarItem(
  event: {
    id: string;
    name: string;
    sex: string;
    type: string;
    displayOrder: number;
    scheduledStartAt: Date | null;
    roundScheduledStarts: unknown;
    scheduledEndAt: Date | null;
    startListRoundCount: number | null;
    scheduleTabId: string | null;
    scheduleTabSortOrder: number | null;
    ageCategory: { id: string; name: string; displayOrder: number } | null;
  }
): StartListEventBarItem {
  return {
    id: event.id,
    name: event.name,
    sex: event.sex,
    type: event.type as "INDIVIDUAL" | "TEAM",
    displayOrder: event.displayOrder,
    ageCategoryId: event.ageCategory?.id ?? null,
    ageCategoryName: event.ageCategory?.name ?? null,
    ageCategoryDisplayOrder: event.ageCategory?.displayOrder ?? null,
    scheduledStartAt: event.scheduledStartAt,
    roundScheduledStarts: event.roundScheduledStarts,
    scheduledEndAt: event.scheduledEndAt,
    startListRoundCount: event.startListRoundCount ?? undefined,
    scheduleTabId: event.scheduleTabId,
    scheduleTabSortOrder: event.scheduleTabSortOrder,
  };
}

export async function buildCompetitionPublicResultsTimetable(
  competitionId: string
): Promise<CompetitionPublicResultsTimetableData | null> {
  const competition = await loadCompetitionPublicStartListDetail(competitionId, null);
  if (!competition) {
    return null;
  }

  const defaultDayKey = firstCompetitionScheduleDayKey(
    competition.startDate,
    competition.endDate
  );
  const competitionDays = enumerateCompetitionScheduleDays(
    competition.startDate,
    competition.endDate
  );

  const scheduleTabs = competition.scheduleTabs.map((t) => ({
    id: t.id,
    name: t.name,
    displayOrder: t.displayOrder,
    scheduleRowOrder: parseScheduleRowOrderByDayJson(t.scheduleRowOrder, defaultDayKey),
  }));

  const events = sortEventsByScheduleTabs(competition.events, scheduleTabs).map(mapEventToBarItem);

  const roundCounts: Record<string, string> = {};
  const roundCountByEventId: Record<string, number> = {};
  for (const ev of events) {
    roundCountByEventId[ev.id] = roundCountForEvent(ev, roundCounts, parseScheduleRoundCountDraft);
  }

  const partition = buildScheduleDayAreaPartition({
    tabs: scheduleTabs,
    events,
    roundCountByEventId,
    competitionDayKeys: competitionDays.map((d) => d.key),
    defaultDayKey,
  });

  const rawSections = buildPublicScheduleSections({
    partition,
    competitionDays,
    tabs: scheduleTabs,
  });

  const { eventSettings } = parseStartListSettings(competition.startListSettings);
  const heatSettingForEvent = (eventId: string): HeatSetting => eventSettings[eventId] ?? {};

  const sections: PublicScheduleViewSection[] = rawSections.map((section) => ({
    dayKey: section.dayKey,
    dayLabel: section.dayLabel,
    isEmpty: section.isEmpty,
    areas: section.areas.map((area) => ({
      tabId: area.tabId,
      tabName: area.tabName,
      rows: buildScheduleRoundRowsFromKeys(
        area.rowKeys,
        events,
        roundCounts,
        heatSettingForEvent,
        parseScheduleRoundCountDraft
      ),
    })),
  }));

  return {
    competitionId: competition.id,
    competitionName: competition.name,
    sections,
    scheduleTabCount: scheduleTabs.length,
    roundCounts,
  };
}

export async function requireCompetitionPublicResultsTimetable(competitionId: string) {
  const data = await buildCompetitionPublicResultsTimetable(competitionId);
  if (!data) {
    notFound();
  }
  return data;
}
