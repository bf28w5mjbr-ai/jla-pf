import { prisma } from "@/server/db";
import {
  enumerateCompetitionScheduleDays,
  firstCompetitionScheduleDayKey,
} from "@/lib/competitionScheduleDays";
import {
  buildDefaultScheduleRowOrder,
  buildScheduleDayAreaPartition,
  partitionByDayToByTab,
} from "@/lib/scheduleRowOrder";
import {
  loadScheduleRowPartitionForCompetition,
  persistScheduleDayAreaPartition,
  scheduleRowOrderNeedsMigration,
} from "@/lib/scheduleRowOrderServer";

/**
 * タイムスケジュール用タブが無い大会に「メイン」タブを 1 本だけ作成し、全種目を紐づける。
 * タブがあるのに scheduleTabId が null の種目は先頭タブへ寄せる。
 * scheduleRowOrder が未設定・旧形式のタブがある場合は by-day 形式へ backfill する。
 */
export async function ensureCompetitionScheduleTabs(competitionId: string): Promise<void> {
  function roundCountFromEvent(startListRoundCount: number | null | undefined): number {
    if (
      typeof startListRoundCount === "number" &&
      Number.isInteger(startListRoundCount) &&
      startListRoundCount >= 1
    ) {
      return Math.min(32, startListRoundCount);
    }
    return 1;
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { startDate: true, endDate: true },
  });
  if (!competition) return;

  const competitionDays = enumerateCompetitionScheduleDays(
    competition.startDate,
    competition.endDate
  );
  const competitionDayKeys = competitionDays.map((d) => d.key);
  const defaultDayKey = firstCompetitionScheduleDayKey(
    competition.startDate,
    competition.endDate
  );

  const existing = await prisma.competitionScheduleTab.count({
    where: { competitionId },
  });
  if (existing === 0) {
    await prisma.$transaction(async (tx) => {
      const events = await tx.event.findMany({
        where: { competitionId },
        select: { id: true, displayOrder: true, startListRoundCount: true },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      });

      const tab = await tx.competitionScheduleTab.create({
        data: {
          competitionId,
          name: "メイン",
          displayOrder: 0,
        },
        select: { id: true },
      });

      const roundCountByEventId: Record<string, number> = {};
      let ord = 0;
      for (const ev of events) {
        ord += 1;
        roundCountByEventId[ev.id] = roundCountFromEvent(ev.startListRoundCount);
        await tx.event.update({
          where: { id: ev.id },
          data: { scheduleTabId: tab.id, scheduleTabSortOrder: ord },
        });
      }

      const rowOrder = buildDefaultScheduleRowOrder(events, roundCountByEventId);
      const byDay: Record<string, string[]> = {
        [defaultDayKey]: rowOrder,
      };
      await tx.competitionScheduleTab.update({
        where: { id: tab.id },
        data: { scheduleRowOrder: byDay },
      });
    });
  }

  const tabs = await prisma.competitionScheduleTab.findMany({
    where: { competitionId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, scheduleRowOrder: true },
  });

  const firstTab = tabs[0];
  if (!firstTab) return;

  const orphanIds = await prisma.event.findMany({
    where: { competitionId, scheduleTabId: null },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  if (orphanIds.length > 0) {
    const maxOrd = await prisma.event.aggregate({
      where: { competitionId, scheduleTabId: firstTab.id },
      _max: { scheduleTabSortOrder: true },
    });
    let ord = maxOrd._max.scheduleTabSortOrder ?? 0;
    for (const { id } of orphanIds) {
      ord += 1;
      await prisma.event.update({
        where: { id },
        data: { scheduleTabId: firstTab.id, scheduleTabSortOrder: ord },
      });
    }
  }

  if (scheduleRowOrderNeedsMigration(tabs)) {
    const { events, partitionByDay, tabs: tabsFull, competitionDayKeys } =
      await loadScheduleRowPartitionForCompetition(competitionId);
    await persistScheduleDayAreaPartition(
      partitionByDay,
      tabsFull.map((t) => t.id),
      events,
      competitionDayKeys
    );
    return;
  }

  const anyNullRowOrder = tabs.some((t) => t.scheduleRowOrder === null);
  if (anyNullRowOrder) {
    const events = await prisma.event.findMany({
      where: { competitionId },
      select: { id: true, scheduleTabId: true, startListRoundCount: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    const roundCountByEventId: Record<string, number> = {};
    for (const ev of events) {
      roundCountByEventId[ev.id] = roundCountFromEvent(ev.startListRoundCount);
    }
    const partitionByDay = buildScheduleDayAreaPartition({
      tabs,
      events,
      roundCountByEventId,
      competitionDayKeys,
      defaultDayKey,
    });
    const byTab = partitionByDayToByTab(
      partitionByDay,
      tabs.map((t) => t.id)
    );
    for (const tab of tabs) {
      await prisma.competitionScheduleTab.update({
        where: { id: tab.id },
        data: { scheduleRowOrder: byTab[tab.id] ?? {} },
      });
    }
  }
}
