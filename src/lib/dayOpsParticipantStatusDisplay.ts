import { marshalStatusKeyFromParts } from "@/lib/dayOpsParticipantKeys";

/**
 * スタートリスト・マーシャルUI向けの当日運用ステータス表示。
 * 競技中の失格（DSQ）の入力は失格管理（参加者ステータス）のみ。公式結果の DSQ は自動反映。
 */

/**
 * DB の DayOpsParticipantStatus には存在しない。マーシャル締切後も未 CALLED の論理表示用。
 * 競技中に審判が付与する DSQ とは別（リザルト対象外・未出場扱い）。
 */
export const DAY_OPS_STATUS_MARSHAL_ABSENT = "MARSHAL_ABSENT" as const;

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
    case "DSQ":
      return "失格（DSQ・競技中）";
    case DAY_OPS_STATUS_MARSHAL_ABSENT:
      return "未出場（マーシャル未完了）";
    default:
      return status;
  }
}

export function isDayOpsTerminalParticipantStatus(status: string | undefined | null): boolean {
  return (
    status === "DNS" ||
    status === "DSQ" ||
    status === "WITHDRAWN" ||
    status === DAY_OPS_STATUS_MARSHAL_ABSENT
  );
}

/**
 * マーシャル締切済みヒートでは、DB が未召集のままでも **未出場（MARSHAL_ABSENT）** とみなす。
 * 競技中の失格（DB の DSQ）とは別。締切操作で行を一括更新せず、締切状態＋未召集で効く。
 * CALLED のみ締切後も出場扱い。終了系（DNS / DB上のDSQ / 棄権）はそのまま。
 */
export function effectiveDayOpsStatusForMarshalDisplay(
  storedStatus: string | undefined | null,
  heatMarshalCallClosed: boolean
): string {
  const st = storedStatus && storedStatus.length > 0 ? storedStatus : "PENDING";
  if (st === "DNS" || st === "DSQ" || st === "WITHDRAWN") return st;
  if (st === "CALLED" || st === "CHECKED_IN") return st;
  if (heatMarshalCallClosed) return DAY_OPS_STATUS_MARSHAL_ABSENT;
  return st;
}

/**
 * 本人棄権・管理者の棄権扱いなど、公開スタートリストの「出場者一覧」から除く行か。
 * （マーシャル起因の DNS は理由に「棄権」が付かない想定で一覧に残す）
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

/**
 * Prisma / API の行から `I:entryId` / `T:teamId:userId` → status のマップを作る。
 * 同一キーの行が複数ある場合は先頭のみ採用するため、呼び出し側は updatedAt 降順で並べること。
 */
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

/**
 * マーシャル API の行とページ同期の DB ステータスを統合する（表示・バッジ用）。
 * - 終了系はサーバー優先（一覧の遅延より確実）。
 * - マーシャル行があるときはその status を採用する。ポールだけが CALLED でマーシャル行が PENDING のときは PENDING のままにし、
 *   リザルト入力可否はマーシャル API の participant.status で判定する（誤入力防止）。
 * - マーシャル行が無いときは終了系のみサーバーから表示。
 */
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

/** 終了系ステータス用の小さなバッジ色（スタートリスト行末） */
export function dayOpsTerminalStatusBadgeClass(status: string): string {
  switch (status) {
    case "DSQ":
      return "border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-100";
    case "DNS":
      return "border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case DAY_OPS_STATUS_MARSHAL_ABSENT:
      return "border-orange-300/90 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/45 dark:text-orange-100";
    case "WITHDRAWN":
      return "border-slate-300/80 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900/55 dark:text-slate-200";
    default:
      return "border-amber-200/90 bg-amber-50/90 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100";
  }
}

/**
 * 当日運用まわりで「サーバー状態が変わったので取り直して」の合図。
 * 参加者ステータスに限らず、同一ブラウザの別タブ向けにマーシャル一覧／リザルト着順の再取得にも使う。
 */
export const JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED = "jla-dayops-participant-status-changed";

export type DayOpsParticipantStatusChangedDetail = {
  competitionId: string;
  eventId: string;
  /** 当該端末で heat-marshal を楽観更新済みのとき、全量 GET の即時再取得を省略 */
  skipMarshalHeatRefetch?: boolean;
};

export function dispatchJlaDayOpsParticipantStatusChanged(
  competitionId: string,
  eventId: string,
  extra?: Pick<DayOpsParticipantStatusChangedDetail, "skipMarshalHeatRefetch">
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, {
      detail: { competitionId, eventId, ...extra },
    })
  );
}
