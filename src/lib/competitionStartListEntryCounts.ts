import type { EventType } from "@prisma/client";
import { competitionEntryEligibleForStartListWhere } from "@/lib/entryCheckoutSessionPaid";
import { prisma } from "@/server/db";

/**
 * スタートリスト設定 UI 用: 種目ごとの「確定エントリー相当」件数（有料は決済済みのみ）。
 * {@link src/app/api/competitions/[id]/start-list-settings/route.ts} と同じ集計条件。
 */
export async function fetchPaidEntryCountByEventId(
  competitionId: string,
  events: Array<{ id: string; type: EventType }>
): Promise<Record<string, number>> {
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return {};

  const entryItemGroups = await prisma.entryItem.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: eventIds },
      entry: {
        competitionId,
        status: "SUBMITTED",
        ...competitionEntryEligibleForStartListWhere,
      },
    },
    _count: { id: true },
  });
  const teamEntryGroups = await prisma.teamEntry.groupBy({
    by: ["eventId"],
    where: { competitionId, eventId: { in: eventIds } },
    _count: { id: true },
  });

  const individualByEvent: Record<string, number> = {};
  for (const row of entryItemGroups) {
    individualByEvent[row.eventId] = row._count.id;
  }
  const teamByEvent: Record<string, number> = {};
  for (const row of teamEntryGroups) {
    teamByEvent[row.eventId] = row._count.id;
  }

  const out: Record<string, number> = {};
  for (const e of events) {
    out[e.id] =
      e.type === "TEAM" ? (teamByEvent[e.id] ?? 0) : (individualByEvent[e.id] ?? 0);
  }
  return out;
}
