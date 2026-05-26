/** 当日運用: ヒート内の入力順で公式結果行を追加 */

import { DayOpsFetchError } from "@/lib/dayOpsFetchError";

export type HeatResultCaptureRow = {
  heat: number | null;
  lane: number | null;
  rank: number | null;
  advanceWithoutRank?: boolean;
  entryType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

export async function getHeatResultCapture(
  competitionId: string,
  eventId: string,
  round: "HEAT" | "SEMI" | "FINAL"
): Promise<{
  lockedAt: string | null;
  confirmedHeats: number[];
  rows: HeatResultCaptureRow[];
}> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture?eventId=${encodeURIComponent(eventId)}&round=${encodeURIComponent(round)}`
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    lockedAt?: string | null;
    confirmedHeats?: unknown;
    rows?: HeatResultCaptureRow[];
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "リザルト状態の取得に失敗しました");
  }
  const raw = data.confirmedHeats;
  const confirmedHeats = Array.isArray(raw)
    ? raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1)
    : [];
  return {
    lockedAt: data.lockedAt ?? null,
    confirmedHeats,
    rows: Array.isArray(data.rows) ? data.rows : [],
  };
}

export async function postHeatResultConfirmHeat(
  competitionId: string,
  body: { eventId: string; round: "HEAT" | "SEMI" | "FINAL"; heatIndex: number }
): Promise<void> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/confirm-heat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "リザルトの確定に失敗しました");
  }
}

export async function postParticipantDsqRevert(
  competitionId: string,
  body: {
    eventId: string;
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId?: string;
    teamEntryId?: string;
    targetStatus: "PENDING" | "CALLED";
    reason: string;
    marshalRound?: "HEAT" | "SEMI" | "FINAL";
  }
): Promise<{ officialSyncSkipped?: boolean }> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/participant-dsq-revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    officialSyncSkipped?: boolean;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "失格の取り消しに失敗しました");
  }
  return { officialSyncSkipped: Boolean(data.officialSyncSkipped) };
}

export async function postHeatLaneDsq(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    lane: number;
    reason?: string;
  }
): Promise<{ alreadyDsq: boolean; officialSyncSkipped?: boolean }> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/heat-lane-dsq`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    alreadyDsq?: boolean;
    officialSyncSkipped?: boolean;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "失格の登録に失敗しました");
  }
  return {
    alreadyDsq: Boolean(data.alreadyDsq),
    officialSyncSkipped: Boolean(data.officialSyncSkipped),
  };
}

export async function postHeatResultCaptureAppend(
  competitionId: string,
  body: Record<string, unknown>
): Promise<{
  rank: number;
  lane: number;
  label: string;
  clubName: string | null;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
}> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/append`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    errorCode?: string;
    rank?: number;
    lane?: number;
    label?: string;
    clubName?: string | null;
    participantType?: string;
    competitionEntryId?: string | null;
    teamEntryId?: string | null;
  };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "順位の記録に失敗しました";
    throw new DayOpsFetchError(msg, res.status, typeof data.errorCode === "string" ? data.errorCode : undefined);
  }
  const rank = Number(data.rank);
  const lane = Number(data.lane);
  if (!Number.isFinite(rank) || !Number.isFinite(lane)) {
    throw new Error("サーバー応答が不正です");
  }
  const participantType = data.participantType === "TEAM" ? "TEAM" : "INDIVIDUAL";
  return {
    rank,
    lane,
    label: String(data.label ?? ""),
    clubName: typeof data.clubName === "string" ? data.clubName : null,
    participantType,
    competitionEntryId: typeof data.competitionEntryId === "string" ? data.competitionEntryId : null,
    teamEntryId: typeof data.teamEntryId === "string" ? data.teamEntryId : null,
  };
}

export async function postHeatResultReorder(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    order: string[];
  }
): Promise<{ updatedCount: number }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/append`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    updatedCount?: number;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "順位の並べ替えに失敗しました");
  }
  return { updatedCount: Number(data.updatedCount ?? 0) };
}

export async function postHeatResultRunUp(
  competitionId: string,
  body: { eventId: string; round: "HEAT" | "SEMI" | "FINAL"; heatIndex: number }
): Promise<{ createdCount: number }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/run-up`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    createdCount?: number;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ランアップの登録に失敗しました");
  }
  return { createdCount: Number(data.createdCount ?? 0) };
}

export async function postHeatResultClearRunUp(
  competitionId: string,
  body: { eventId: string; round: "HEAT" | "SEMI" | "FINAL"; heatIndex: number }
): Promise<{ deletedCount: number }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/clear-run-up`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    deletedCount?: number;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ランアップの解除に失敗しました");
  }
  return { deletedCount: Number(data.deletedCount ?? 0) };
}
