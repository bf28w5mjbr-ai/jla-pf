import { createHash } from "crypto";
import type { ResultRound } from "@prisma/client";
import { prisma } from "@/server/db";
import { getRoundDataFromSnapshot, parseStartListSnapshotLooseForRoundRead } from "@/lib/heatMarshalFromSnapshot";
import { loadStartListSnapshotPayloadLoose } from "@/lib/heatMarshalGate";
import type { StartListRound, StartListRoundData } from "@/lib/startListRounds";

type PrevRoundFingerprintRow = {
  heat: number | null;
  rank: number | null;
  advanceWithoutRank: boolean;
  entryType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

export function fingerprintFromPrevRoundOfficialData(params: {
  confirmedHeats: number[];
  rows: PrevRoundFingerprintRow[];
}): string {
  const confirmed = [...params.confirmedHeats].sort((a, b) => a - b);
  const rowKeys = params.rows
    .map((r) => {
      const id =
        r.entryType === "TEAM"
          ? `T:${r.teamEntryId ?? ""}`
          : `I:${r.competitionEntryId ?? ""}`;
      return [
        id,
        r.heat ?? "",
        r.rank ?? "",
        r.advanceWithoutRank ? "1" : "0",
      ].join("|");
    })
    .sort();
  const payload = JSON.stringify({ confirmed, rows: rowKeys });
  return createHash("sha256").update(payload).digest("hex");
}

export async function loadPrevRoundOfficialFingerprintRows(params: {
  competitionId: string;
  eventId: string;
  fromRound: ResultRound;
}): Promise<{
  confirmedHeats: number[];
  rows: PrevRoundFingerprintRow[];
} | null> {
  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: params.competitionId,
        eventId: params.eventId,
        round: params.fromRound,
      },
    },
    select: {
      rows: {
        where: { status: "OK" },
        select: {
          heat: true,
          rank: true,
          advanceWithoutRank: true,
          entryType: true,
          competitionEntryId: true,
          teamEntryId: true,
        },
        orderBy: [{ heat: "asc" }, { rank: "asc" }],
      },
      heatConfirmations: { select: { heat: true }, orderBy: { heat: "asc" } },
    },
  });
  if (!official) return null;
  return {
    confirmedHeats: official.heatConfirmations.map((c) => c.heat),
    rows: official.rows.map((r) => ({
      heat: r.heat,
      rank: r.rank,
      advanceWithoutRank: Boolean(r.advanceWithoutRank),
      entryType: r.entryType,
      competitionEntryId: r.competitionEntryId,
      teamEntryId: r.teamEntryId,
    })),
  };
}

export async function computePrevRoundOfficialFingerprint(params: {
  competitionId: string;
  eventId: string;
  fromRound: ResultRound;
}): Promise<string | null> {
  const loaded = await loadPrevRoundOfficialFingerprintRows(params);
  if (!loaded) return null;
  return fingerprintFromPrevRoundOfficialData(loaded);
}

export function storedFingerprintForNextRoundBlock(
  block: StartListRoundData | null | undefined
): string | null {
  const fp = block?.sourceOfficialFingerprint;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

export function findResultBasedRoundBlock(
  rounds: StartListRoundData[] | undefined,
  round: StartListRound
): StartListRoundData | undefined {
  return rounds?.find((r) => r.round === round && r.generatedBy === "RESULT_BASED");
}

export async function isNextRoundMarshalStarted(params: {
  competitionId: string;
  eventId: string;
  toRound: ResultRound;
}): Promise<boolean> {
  const { competitionId, eventId, toRound } = params;

  const closedHeat = await prisma.competitionHeatMarshalState.findFirst({
    where: {
      competitionId,
      eventId,
      round: toRound,
      callClosedAt: { not: null },
    },
    select: { id: true },
  });
  if (closedHeat) return true;

  const terminalStatuses = ["DNS", "WITHDRAWN", "DSQ", "DNF"] as const;
  const activeStatus = await prisma.competitionParticipantStatus.findFirst({
    where: {
      competitionId,
      eventId,
      marshalRound: toRound,
      OR: [{ status: "CALLED" }, { status: { in: [...terminalStatuses] } }],
    },
    select: { id: true },
  });
  return Boolean(activeStatus);
}

export async function readStoredNextRoundFingerprint(params: {
  competitionId: string;
  eventId: string;
  toRound: StartListRound;
}): Promise<string | null> {
  const snapshot = await loadStartListSnapshotPayloadLoose(params.competitionId);
  if (!snapshot) return null;
  const roundData = getRoundDataFromSnapshot(snapshot, params.eventId, params.toRound);
  return storedFingerprintForNextRoundBlock(roundData);
}
