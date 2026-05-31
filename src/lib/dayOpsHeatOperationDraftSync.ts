/** サーバー側のヒート別ドラフトを削除（確定後の promotion 後片付け。失敗は無視） */
export function deleteHeatOperationDraftFireAndForget(
  competitionId: string,
  input: { eventId: string; round: string; heatIndex: number }
): void {
  const q = new URLSearchParams({
    eventId: input.eventId,
    round: input.round,
    heatIndex: String(input.heatIndex),
  });
  void fetch(`/api/competitions/${competitionId}/day-ops/heat-operation-draft?${q}`, {
    method: "DELETE",
    credentials: "same-origin",
  }).catch(() => {});
}

/** 当日運用: ヒート別ドラフト変更（複数端末・SSE 向け） */
export const JLA_DAY_OPS_DRAFT_CHANGED = "jla-day-ops-draft-changed";

export type DayOpsDraftChangedDetail = {
  competitionId: string;
  eventId: string;
  round?: "HEAT" | "SEMI" | "FINAL";
  heatIndex?: number;
};

export function dispatchJlaDayOpsDraftChanged(
  competitionId: string,
  eventId: string,
  extra?: Pick<DayOpsDraftChangedDetail, "round" | "heatIndex">
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(JLA_DAY_OPS_DRAFT_CHANGED, {
      detail: { competitionId, eventId, ...extra },
    })
  );
}

/** クライアントの `marshalDraftOps` の各値と同形（1 ヒート分を PATCH する） */
export type HeatMarshalDraftServerEntry = {
  opKey: string;
  eventId: string;
  round: "HEAT" | "SEMI" | "FINAL";
  heatIndex: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string | null;
  status: "CALLED" | "PENDING";
  lastKnownUpdatedAt?: string | null;
  draftSequence?: number;
};

/** クライアントの `resultDraftOps` の各値と同形（1 ヒート分を PATCH する） */
export type HeatResultDraftServerEntry = {
  opKey: string;
  heatIndex: number;
  tieWithPrevious: boolean;
  inputOrder: "asc" | "desc";
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string;
  /** チェック順（仮順位表示用）。未設定の旧データは 0 扱い */
  draftSequence?: number;
};

function draftQuery(input: { eventId: string; round: string; heatIndex: number }): string {
  return new URLSearchParams({
    eventId: input.eventId,
    round: input.round,
    heatIndex: String(input.heatIndex),
  }).toString();
}

/** マーシャル下書きをサーバーと同期（`NEXT_PUBLIC_DAY_OPS_MARSHAL_DRAFT_SYNC=0` でのみ無効化） */
export function isDayOpsMarshalDraftServerSyncEnabled(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.NEXT_PUBLIC_DAY_OPS_MARSHAL_DRAFT_SYNC !== "0";
}

/** リザルト下書きをサーバーと同期（`NEXT_PUBLIC_DAY_OPS_RESULT_DRAFT_SYNC=0` でのみ無効化） */
export function isDayOpsResultDraftServerSyncEnabled(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.NEXT_PUBLIC_DAY_OPS_RESULT_DRAFT_SYNC !== "0";
}

export function parseServerMarshalDraftPayload(
  raw: unknown
): Record<string, HeatMarshalDraftServerEntry> | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as { entries?: unknown };
  if (!o.entries || typeof o.entries !== "object") return null;
  return o.entries as Record<string, HeatMarshalDraftServerEntry>;
}

export function parseServerResultDraftPayload(
  raw: unknown
): Record<string, HeatResultDraftServerEntry> | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as { entries?: unknown };
  if (!o.entries || typeof o.entries !== "object") return null;
  return o.entries as Record<string, HeatResultDraftServerEntry>;
}

export type HeatOperationDraftListItem = {
  heatIndex: number;
  marshalDraftPayload: unknown;
  resultDraftPayload: unknown;
  updatedAt: string;
};

export async function listHeatOperationDrafts(
  competitionId: string,
  input: { eventId: string; round: string }
): Promise<HeatOperationDraftListItem[]> {
  const q = new URLSearchParams({
    eventId: input.eventId,
    round: input.round,
  });
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-operation-draft?${q}`,
    { credentials: "same-origin" }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    drafts?: unknown;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ドラフト一覧の取得に失敗しました");
  }
  if (!Array.isArray(data.drafts)) return [];
  const out: HeatOperationDraftListItem[] = [];
  for (const item of data.drafts) {
    if (!item || typeof item !== "object") continue;
    const o = item as {
      heatIndex?: unknown;
      marshalDraftPayload?: unknown;
      resultDraftPayload?: unknown;
      updatedAt?: unknown;
    };
    const heatIndex = Number(o.heatIndex);
    if (!Number.isFinite(heatIndex) || heatIndex < 1) continue;
    if (typeof o.updatedAt !== "string") continue;
    out.push({
      heatIndex,
      marshalDraftPayload: o.marshalDraftPayload ?? null,
      resultDraftPayload: o.resultDraftPayload ?? null,
      updatedAt: o.updatedAt,
    });
  }
  return out;
}

export async function getHeatOperationDraft(
  competitionId: string,
  input: { eventId: string; round: string; heatIndex: number }
): Promise<{
  marshalDraftPayload: unknown;
  resultDraftPayload: unknown;
  updatedAt: string | null;
}> {
  const res = await fetch(
    `/api/competitions/${competitionId}/day-ops/heat-operation-draft?${draftQuery(input)}`,
    { credentials: "same-origin" }
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    marshalDraftPayload?: unknown;
    resultDraftPayload?: unknown;
    updatedAt?: string | null;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ドラフトの取得に失敗しました");
  }
  return {
    marshalDraftPayload: data.marshalDraftPayload ?? null,
    resultDraftPayload: data.resultDraftPayload ?? null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export async function patchHeatOperationDraftResultPayload(
  competitionId: string,
  input: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    entries: Record<string, HeatResultDraftServerEntry>;
  },
  options?: { keepalive?: boolean }
): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/heat-operation-draft`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    keepalive: options?.keepalive ?? false,
    body: JSON.stringify({
      eventId: input.eventId,
      round: input.round,
      heatIndex: input.heatIndex,
      resultDraftPayload: { entries: input.entries },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ドラフトの保存に失敗しました");
  }
  if (typeof data.updatedAt !== "string") {
    throw new Error("サーバー応答が不正です");
  }
  dispatchJlaDayOpsDraftChanged(competitionId, input.eventId, {
    round: input.round,
    heatIndex: input.heatIndex,
  });
  return { updatedAt: data.updatedAt };
}

export function patchHeatOperationDraftResultPayloadFireAndForget(
  competitionId: string,
  input: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    entries: Record<string, HeatResultDraftServerEntry>;
  },
  options?: { keepalive?: boolean }
): void {
  void patchHeatOperationDraftResultPayload(competitionId, input, options).catch(() => {});
}

export async function patchHeatOperationDraftMarshalPayload(
  competitionId: string,
  input: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    entries: Record<string, HeatMarshalDraftServerEntry>;
  },
  options?: { keepalive?: boolean }
): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/competitions/${competitionId}/day-ops/heat-operation-draft`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    keepalive: options?.keepalive ?? false,
    body: JSON.stringify({
      eventId: input.eventId,
      round: input.round,
      heatIndex: input.heatIndex,
      marshalDraftPayload: { entries: input.entries },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "ドラフトの保存に失敗しました");
  }
  if (typeof data.updatedAt !== "string") {
    throw new Error("サーバー応答が不正です");
  }
  dispatchJlaDayOpsDraftChanged(competitionId, input.eventId, {
    round: input.round,
    heatIndex: input.heatIndex,
  });
  return { updatedAt: data.updatedAt };
}

export function patchHeatOperationDraftMarshalPayloadFireAndForget(
  competitionId: string,
  input: {
    eventId: string;
    round: "HEAT" | "SEMI" | "FINAL";
    heatIndex: number;
    entries: Record<string, HeatMarshalDraftServerEntry>;
  },
  options?: { keepalive?: boolean }
): void {
  void patchHeatOperationDraftMarshalPayload(competitionId, input, options).catch(() => {});
}
