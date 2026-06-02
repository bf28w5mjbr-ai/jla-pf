import { marshalStatusKeyFromParts } from "@/lib/dayOpsParticipantKeys";

/**
 * スタートリスト・マーシャルUI向けの当日運用ステータス表示。
 * 終了ステータスは終了ステータス管理から登録し、公式結果に自動反映する。
 */

/** @deprecated マーシャル締切時に DB へ DNS を書き込むため表示専用ステータスは廃止 */
export const DAY_OPS_STATUS_MARSHAL_ABSENT = "MARSHAL_ABSENT" as const;

/** @deprecated */
export function isMarshalAbsentDisplayStatus(status: string | undefined | null): boolean {
  return status === DAY_OPS_STATUS_MARSHAL_ABSENT;
}

export function dayOpsParticipantStatusLabelJa(status: string | undefined | null): string {
  if (!status || typeof status !== "string") return "—";
  switch (status) {
    case "PENDING":
      return "未召集";
    case "CALLED":
      return "召集済";
    case "CHECKED_IN":
      return "チェックイン済";
    case "DNS":
      return "欠場（DNS）";
    case "WITHDRAWN":
      return "棄権";
    case "DNF":
      return "DNF（途中辞退）";
    case "DSQ":
      return "失格（DSQ・競技中）";
    default:
      return status;
  }
}

export function isDayOpsTerminalParticipantStatus(status: string | undefined | null): boolean {
  return (
    status === "DNS" ||
    status === "DSQ" ||
    status === "WITHDRAWN" ||
    status === "DNF"
  );
}

/**
 * マーシャル締切後も DB 上のステータスをそのまま表示する（未召集は締切時に DNS 化）。
 */
export function effectiveDayOpsStatusForMarshalDisplay(
  storedStatus: string | undefined | null,
  _heatMarshalCallClosed: boolean
): string {
  const st = storedStatus && storedStatus.length > 0 ? storedStatus : "PENDING";
  return st;
}

/**
 * 本人棄権など、公開スタートリストの「出場者一覧」から除く行か。
 */
export function shouldHideFromStartListLineupParticipantRow(row: {
  status: string;
  reason: string | null;
}): boolean {
  if (row.status === "WITHDRAWN") return true;
  if (row.status === "DNS" && typeof row.reason === "string" && row.reason.includes("棄権")) {
    return true;
  }
  return false;
}

export function buildParticipantDayOpsStatusByKey(
  rows: ReadonlyArray<{
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    teamMemberUserId?: string | null;
    status: string;
  }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = marshalStatusKeyFromParts(
      row.participantType,
      row.competitionEntryId,
      row.teamEntryId,
      row.teamMemberUserId
    );
    if (!k) continue;
    if (out[k] !== undefined) continue;
    out[k] = row.status;
  }
  return out;
}

export function resolveHeatLaneDayOpsDisplayStatus(
  marshalParticipant: { status: string } | undefined,
  serverStatus: string | undefined
): string | undefined {
  if (serverStatus && isDayOpsTerminalParticipantStatus(serverStatus)) {
    return serverStatus;
  }
  if (marshalParticipant) {
    return marshalParticipant.status;
  }
  return serverStatus;
}

export function dayOpsTerminalStatusBadgeClass(status: string): string {
  switch (status) {
    case "DSQ":
      return "border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100";
    case "DNS":
      return "border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "DNF":
      return "border-violet-300/90 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-100";
    case "WITHDRAWN":
      return "border-slate-300/80 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900/55 dark:text-slate-200";
    default:
      return "border-amber-200/90 bg-amber-50/90 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100";
  }
}

export const JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED = "jla-dayops-participant-status-changed";

export type DayOpsParticipantStatusChangedDetail = {
  competitionId: string;
  eventId: string;
  skipMarshalHeatRefetch?: boolean;
  skipResultCaptureRefetch?: boolean;
  skipParticipantPoll?: boolean;
};

export function dispatchJlaDayOpsParticipantStatusChanged(
  competitionId: string,
  eventId: string,
  extra?: Pick<
    DayOpsParticipantStatusChangedDetail,
    "skipMarshalHeatRefetch" | "skipResultCaptureRefetch" | "skipParticipantPoll"
  >
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, {
      detail: { competitionId, eventId, ...extra },
    })
  );
}
