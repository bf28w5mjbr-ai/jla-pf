import type { Prisma, ResultRound } from "@prisma/client";
import type { TerminalDayOpsStatus } from "@/lib/officialResultTerminalSync";
import {
  applyOfficialRowForParticipantTerminal,
  ensureOfficialResultForRound,
  type TerminalOfficialStatus,
} from "@/lib/officialResultTerminalSync";
import { compactOkRanksForHeatInTransaction } from "@/lib/heatResultRankCompact";
import type { MarshalParticipantRef } from "@/lib/heatMarshalFromSnapshot";

const TERMINAL_STATUSES: TerminalDayOpsStatus[] = ["DNS", "WITHDRAWN", "DSQ", "DNF"];

export function dayOpsStatusToOfficialStatus(
  status: TerminalDayOpsStatus
): TerminalOfficialStatus {
  return status;
}

const DEFAULT_REASONS: Record<TerminalDayOpsStatus, string> = {
  DNS: "終了ステータス管理からの欠場（DNS）",
  WITHDRAWN: "終了ステータス管理からの棄権",
  DNF: "終了ステータス管理からの途中辞退（DNF）",
  DSQ: "終了ステータス管理からの失格申請",
};

export function defaultTerminalReason(status: TerminalDayOpsStatus): string {
  return DEFAULT_REASONS[status];
}

export async function syncTerminalAndCompactRanksInTransaction(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string;
    eventId: string;
    round: ResultRound;
    heatIndex: number;
    lane: number;
    participant: MarshalParticipantRef;
    status: TerminalDayOpsStatus;
    reason: string;
  }
): Promise<boolean> {
  const sync = await applyOfficialRowForParticipantTerminal(tx, {
    competitionId: opts.competitionId,
    eventId: opts.eventId,
    round: opts.round,
    heatIndex: opts.heatIndex,
    lane: opts.lane,
    participant: opts.participant,
    status: dayOpsStatusToOfficialStatus(opts.status),
    reason: opts.reason,
  });
  if (!sync.officialSyncSkipped) {
    const heatConfirmed = await tx.officialResultHeatConfirmed.findFirst({
      where: {
        heat: opts.heatIndex,
        officialResult: {
          competitionId: opts.competitionId,
          eventId: opts.eventId,
          round: opts.round,
        },
      },
      select: { id: true },
    });
    if (!heatConfirmed) {
      const ensured = await ensureOfficialResultForRound(
        tx,
        opts.competitionId,
        opts.eventId,
        opts.round
      );
      if (!ensured.locked) {
        await compactOkRanksForHeatInTransaction(tx, {
          officialResultId: ensured.officialResultId,
          heatIndex: opts.heatIndex,
        });
      }
    }
  }
  return sync.officialSyncSkipped;
}

export { TERMINAL_STATUSES };
