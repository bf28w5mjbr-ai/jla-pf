import { prisma } from "@/server/db";

/**
 * タイムスケジュール用タブが無い大会に「メイン」タブを 1 本だけ作成し、全種目を紐づける。
 * タブがあるのに scheduleTabId が null の種目は先頭タブへ寄せる。
 */
export async function ensureCompetitionScheduleTabs(competitionId: string): Promise<void> {
  const existing = await prisma.competitionScheduleTab.count({
    where: { competitionId },
  });
  if (existing === 0) {
    await prisma.$transaction(async (tx) => {
      const events = await tx.event.findMany({
        where: { competitionId },
        select: { id: true, displayOrder: true },
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

      let ord = 0;
      for (const ev of events) {
        ord += 1;
        await tx.event.update({
          where: { id: ev.id },
          data: { scheduleTabId: tab.id, scheduleTabSortOrder: ord },
        });
      }
    });
  }

  const firstTab = await prisma.competitionScheduleTab.findFirst({
    where: { competitionId },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  if (!firstTab) return;

  const orphanIds = await prisma.event.findMany({
    where: { competitionId, scheduleTabId: null },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  if (orphanIds.length === 0) return;

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
