import { useMemo } from "react";
import type { ResultRound } from "@prisma/client";
import {
  buildParticipantStatusRecordForRound,
  type ParticipantStatusRowForScope,
} from "@/lib/competitionParticipantStatusScope";

export type LiveRoundParticipantStatusRow = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  marshalRound: ResultRound;
  updatedAt: Date | string;
  calledAt?: Date | string | null;
  teamMemberUserId?: string | null;
};

export function buildStatusUpdatedAtByKey(
  participantStatusRows: ReadonlyArray<LiveRoundParticipantStatusRow> | null | undefined,
  marshalRoundForDisplay: ResultRound | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!participantStatusRows?.length || !marshalRoundForDisplay) return out;
  for (const row of participantStatusRows) {
    if (row.marshalRound !== marshalRoundForDisplay) continue;
    const pType = row.participantType === "TEAM" ? "TEAM" : "INDIVIDUAL";
    const teamMemberUserId = row.teamMemberUserId;
    const key =
      pType === "INDIVIDUAL"
        ? `I:${row.competitionEntryId ?? ""}`
        : teamMemberUserId
          ? `T:${row.teamEntryId ?? ""}:${teamMemberUserId}`
          : `T:${row.teamEntryId ?? ""}`;
    if (!key) continue;
    const ts = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    if (!Number.isFinite(ts.getTime())) continue;
    const prev = out[key];
    if (!prev || new Date(prev).getTime() < ts.getTime()) {
      out[key] = ts.toISOString();
    }
  }
  return out;
}

export function useLiveRoundParticipantStatus(args: {
  participantStatusRows?: ReadonlyArray<LiveRoundParticipantStatusRow> | null;
  participantStatusByKey?: Readonly<Record<string, string>> | null;
  marshalRoundForDisplay?: ResultRound | null;
}) {
  const { participantStatusRows, participantStatusByKey, marshalRoundForDisplay } = args;

  const statusByKey = useMemo(() => {
    if (participantStatusRows?.length && marshalRoundForDisplay) {
      const normalized: ParticipantStatusRowForScope[] = participantStatusRows.map((r) => ({
        participantType: r.participantType,
        competitionEntryId: r.competitionEntryId,
        teamEntryId: r.teamEntryId,
        status: r.status,
        marshalRound: r.marshalRound,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
        calledAt:
          r.calledAt == null
            ? null
            : r.calledAt instanceof Date
              ? r.calledAt
              : new Date(r.calledAt),
        teamMemberUserId: r.teamMemberUserId,
      }));
      return buildParticipantStatusRecordForRound(normalized, marshalRoundForDisplay);
    }
    return participantStatusByKey ?? {};
  }, [participantStatusRows, marshalRoundForDisplay, participantStatusByKey]);

  const statusUpdatedAtByKey = useMemo(
    () => buildStatusUpdatedAtByKey(participantStatusRows, marshalRoundForDisplay),
    [participantStatusRows, marshalRoundForDisplay]
  );

  return { statusByKey, statusUpdatedAtByKey };
}
