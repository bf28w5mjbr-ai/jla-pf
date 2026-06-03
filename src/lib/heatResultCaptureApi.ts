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

export type HeatResultConfirmManualEntry = {
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string;
  tieWithPrevious?: boolean;
  inputOrder?: "asc" | "desc";
};

export type HeatResultConfirmAppendedRow = {
  rank: number;
  lane: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

export async function postHeatResultConfirmHeat(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    manualEntries?: HeatResultConfirmManualEntry[];
  }
): Promise<{
  appended: HeatResultConfirmAppendedRow[];
}> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/confirm-heat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    appended?: HeatResultConfirmAppendedRow[];
  };
  if (!res.ok) {
    const msg =
      typeof data.error === "string" && data.error !== "internal_error"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "リザルトの確定に失敗しました";
    throw new Error(msg);
  }
  return {
    appended: Array.isArray(data.appended) ? data.appended : [],
  };
}

export async function postHeatResultUnconfirmHeat(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
  }
): Promise<{ ok: true; heatIndex: number }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-result-capture/unconfirm-heat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    ok?: boolean;
    heatIndex?: number;
  };
  if (!res.ok) {
    const msg =
      typeof data.error === "string" && data.error !== "internal_error"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "リザルト確定の解除に失敗しました";
    throw new Error(msg);
  }
  return { ok: true, heatIndex: body.heatIndex };
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

export async function postHeatLaneTerminalStatus(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    lane: number;
    status: "DNS" | "WITHDRAWN" | "DSQ" | "DNF";
    reason?: string;
  }
): Promise<{ alreadyApplied: boolean; officialSyncSkipped?: boolean }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-lane-terminal-status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    alreadyApplied?: boolean;
    officialSyncSkipped?: boolean;
  };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "終了ステータスの登録に失敗しました"
    );
  }
  return {
    alreadyApplied: Boolean(data.alreadyApplied),
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

export async function postParticipantTerminalRevert(
  competitionId: string,
  body: {
    eventId: string;
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId?: string;
    teamEntryId?: string;
    targetStatus: "PENDING" | "CALLED";
    reason: string;
    marshalRound?: "HEAT" | "SEMI" | "FINAL";
    fromStatus?: "DNS" | "WITHDRAWN" | "DSQ" | "DNF";
  }
): Promise<{ officialSyncSkipped?: boolean; revertedFrom?: string }> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/participant-terminal-revert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    officialSyncSkipped?: boolean;
    revertedFrom?: string;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "取り消しに失敗しました");
  }
  return {
    officialSyncSkipped: Boolean(data.officialSyncSkipped),
    revertedFrom: typeof data.revertedFrom === "string" ? data.revertedFrom : undefined,
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

export type HeatResultRunUpCreatedRow = {
  heat: number;
  lane: number;
  rank: null;
  advanceWithoutRank: true;
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string | null;
  teamEntryId: string | null;
};

export async function postHeatResultRunUp(
  competitionId: string,
  body: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    manualEntries?: HeatResultConfirmManualEntry[];
  }
): Promise<{
  createdCount: number;
  created: HeatResultRunUpCreatedRow[];
  appended: HeatResultConfirmAppendedRow[];
}> {
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
    created?: HeatResultRunUpCreatedRow[];
    appended?: HeatResultConfirmAppendedRow[];
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ランアップの登録に失敗しました");
  }
  return {
    createdCount: Number(data.createdCount ?? 0),
    created: Array.isArray(data.created) ? data.created : [],
    appended: Array.isArray(data.appended) ? data.appended : [],
  };
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

export type NextRoundSlStatusResponse = {
  fromRound: "HEAT" | "SEMI";
  toRound: "SEMI" | "FINAL";
  allHeatsConfirmed: boolean;
  nextRoundExists: boolean;
  marshalStarted: boolean;
  toRoundHasBlockingOfficialResults: boolean;
  currentFingerprint: string | null;
  storedFingerprint: string | null;
  fingerprintMatches: boolean;
  canGenerate: boolean;
  canRegenerate: boolean;
  canRescueRegenerate: boolean;
  blockedReason: string | null;
};

export async function getNextRoundSlStatus(
  competitionId: string,
  eventId: string,
  fromRound: "HEAT" | "SEMI"
): Promise<NextRoundSlStatusResponse> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/next-round-sl-status?eventId=${encodeURIComponent(eventId)}&fromRound=${encodeURIComponent(fromRound)}`
  );
  const data = (await res.json().catch(() => ({}))) as NextRoundSlStatusResponse & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "SL 生成状態の取得に失敗しました");
  }
  return data;
}

export async function postNextRoundSlGenerate(
  competitionId: string,
  body: {
    eventId: string;
    fromRound: "HEAT" | "SEMI";
    mode: "create" | "regenerate" | "rescue";
  }
): Promise<{
  toRound: "SEMI" | "FINAL";
  participantCount: number;
  heatCount: number;
}> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/next-round-sl-generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    toRound?: "SEMI" | "FINAL";
    participantCount?: number;
    heatCount?: number;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "SL 生成に失敗しました");
  }
  return {
    toRound: data.toRound === "FINAL" || data.toRound === "SEMI" ? data.toRound : "FINAL",
    participantCount: Number(data.participantCount ?? 0),
    heatCount: Number(data.heatCount ?? 0),
  };
}
