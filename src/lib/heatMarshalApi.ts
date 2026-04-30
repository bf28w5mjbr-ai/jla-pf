/** クライアントから heat-marshal/complete を呼ぶ */

import { DayOpsFetchError } from "@/lib/dayOpsFetchError";

export type HeatMarshalCompleteResponse = {
  lane: number;
  label?: string;
  clubName?: string | null;
  alreadyMarshalled?: boolean;
};

export type ParticipantStatusBulkOperation = {
  opKey: string;
  eventId: string;
  round: "HEAT" | "SEMI" | "FINAL";
  heatIndex: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string | null;
  status: "CALLED" | "PENDING";
  reason?: string;
  lastKnownUpdatedAt?: string | null;
};

export type ParticipantStatusBulkResponse = {
  success: Array<{
    opKey: string;
    lane: number;
    label: string;
    status: "CALLED" | "PENDING";
    alreadyMarshalled?: boolean;
  }>;
  failed: Array<{
    opKey: string;
    error: string;
    errorCode?: string;
  }>;
};

export async function postHeatMarshalComplete(
  competitionId: string,
  body: Record<string, unknown>
): Promise<HeatMarshalCompleteResponse> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/heat-marshal/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as HeatMarshalCompleteResponse & {
    error?: string;
    errorCode?: string;
  };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "マーシャル完了に失敗しました";
    throw new DayOpsFetchError(msg, res.status, typeof data.errorCode === "string" ? data.errorCode : undefined);
  }
  return data;
}

/** マーシャル締切前: CALLED を PENDING に戻す（当日運用管理者・練習用） */
export async function postMarshalRevertPending(
  competitionId: string,
  body: {
    eventId: string;
    marshalRound: "HEAT" | "SEMI" | "FINAL";
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId?: string;
    teamEntryId?: string;
    /** チーム種目: 構成員単位の召集取り消し */
    teamMemberUserId?: string | null;
  }
): Promise<void> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/participant-statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: body.eventId,
      status: "PENDING",
      participantType: body.participantType,
      competitionEntryId: body.competitionEntryId,
      teamEntryId: body.teamEntryId,
      teamMemberUserId:
        body.participantType === "TEAM" ? body.teamMemberUserId ?? null : undefined,
      marshalRound: body.marshalRound,
      revertMarshalPractice: true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "召集の取り消しに失敗しました");
  }
}

export async function postParticipantStatusesBulk(
  competitionId: string,
  operations: ParticipantStatusBulkOperation[]
): Promise<ParticipantStatusBulkResponse> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/participant-statuses/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  const data = (await res.json().catch(() => ({}))) as
    | ParticipantStatusBulkResponse
    | { error?: string; errorCode?: string };
  if (!res.ok) {
    throw new DayOpsFetchError(
      typeof (data as { error?: string }).error === "string"
        ? (data as { error?: string }).error!
        : "一括反映に失敗しました",
      res.status,
      typeof (data as { errorCode?: string }).errorCode === "string"
        ? (data as { errorCode?: string }).errorCode
        : undefined
    );
  }
  return {
    success: Array.isArray((data as ParticipantStatusBulkResponse).success)
      ? (data as ParticipantStatusBulkResponse).success
      : [],
    failed: Array.isArray((data as ParticipantStatusBulkResponse).failed)
      ? (data as ParticipantStatusBulkResponse).failed
      : [],
  };
}
