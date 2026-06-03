import type { ResultRound } from "@prisma/client";
import type { ReactNode } from "react";
import type { HeatMarshalHeatRow, HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { secondaryClubLineForIndividual } from "@/lib/startListTeamDisplay";
import {
  dayOpsParticipantStatusLabelJa,
  dayOpsTerminalStatusBadgeClass,
  effectiveDayOpsStatusForMarshalDisplay,
  isDayOpsTerminalParticipantStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import {
  marshalIndividualKey,
  marshalTeamLegacyKey,
  resultParticipantKeyFromParts,
} from "@/lib/dayOpsParticipantKeys";
import {
  foldTeamMemberStatuses,
  isCalledLikeStatus,
  isTeamFullyCalled,
} from "@/lib/dayOpsTeamStatus";
import { computeProvisionalDraftRanks } from "@/lib/heatResultCaptureNextRank";
import { terminalParticipantKeysForHeat } from "@/hooks/liveRound/resultCaptureDraftHelpers";
import { cn } from "@/lib/utils";
import { sexLabelJa } from "@/lib/sexLabelJa";
import type { IndividualItem, SnapshotParticipant, TeamItem } from "./types";

export function foldTeamMarshalStatuses(rows: HeatMarshalParticipant[]): string {
  return foldTeamMemberStatuses(rows.map((r) => r.status));
}

type MarshalHeatOverlayOp = {
  opKey: string;
  heatIndex: number;
  status: "CALLED" | "PENDING";
};

export function applyMarshalDraftOpsToHeats(
  heats: HeatMarshalHeatRow[],
  draftOps: Record<string, MarshalHeatOverlayOp>
): HeatMarshalHeatRow[] {
  const ops = Object.values(draftOps);
  if (ops.length === 0) return heats;
  const byHeat = new Map<number, Map<string, "CALLED" | "PENDING">>();
  for (const op of ops) {
    const map = byHeat.get(op.heatIndex) ?? new Map<string, "CALLED" | "PENDING">();
    map.set(op.opKey, op.status);
    byHeat.set(op.heatIndex, map);
  }
  return heats.map((heat) => {
    const map = byHeat.get(heat.heatIndex);
    if (!map || map.size === 0) return heat;
    return {
      ...heat,
      participants: heat.participants.map((p) => {
        const pKey = marshalParticipantKey(p);
        const nextStatus = map.get(pKey);
        return nextStatus ? { ...p, status: nextStatus } : p;
      }),
    };
  });
}

/** 未保存ドラフトとサーバー確定済みオーバーレイを合成（同一キーはドラフト優先） */
export function mergeMarshalHeatOverlayOps(
  draftOps: Record<string, MarshalHeatOverlayOp>,
  committedOps: Record<string, MarshalHeatOverlayOp>
): Record<string, MarshalHeatOverlayOp> {
  return { ...committedOps, ...draftOps };
}

function participantStatusByOpKey(
  heats: HeatMarshalHeatRow[],
  opKey: string
): string | undefined {
  for (const h of heats) {
    for (const p of h.participants) {
      if (marshalParticipantKey(p) === opKey) return p.status;
    }
  }
  return undefined;
}

/** heat-marshal GET が DB 反映前に PENDING を返したとき、サーバーが op と一致したら除去する */
export function pruneMarshalCommittedOps<T extends MarshalHeatOverlayOp>(
  heats: HeatMarshalHeatRow[],
  committedOps: Record<string, T>
): Record<string, T> {
  if (Object.keys(committedOps).length === 0) return committedOps;
  const next = { ...committedOps };
  for (const [opKey, op] of Object.entries(committedOps)) {
    const serverStatus = participantStatusByOpKey(heats, opKey);
    if (serverStatus == null) continue;
    if (serverStatus === op.status) {
      delete next[opKey];
      continue;
    }
    if (op.status === "CALLED" && isCalledLikeStatus(serverStatus)) {
      delete next[opKey];
    }
  }
  return next;
}

/**
 * ポーリング再取得でローカルに CALLED 済みの行が PENDING に巻き戻らないようマージする。
 * （自動保存直後の GET 遅延・別タブ同期の競合対策）
 */
export function mergeListMarshalHeatsOnRefetch(
  prev: HeatMarshalHeatRow[] | null | undefined,
  incoming: HeatMarshalHeatRow[]
): HeatMarshalHeatRow[] {
  if (!prev?.length) return incoming;
  const prevStatusByKey = new Map<string, string>();
  for (const h of prev) {
    for (const p of h.participants) {
      prevStatusByKey.set(marshalParticipantKey(p), p.status);
    }
  }
  return incoming.map((heat) => ({
    ...heat,
    participants: heat.participants.map((p) => {
      const key = marshalParticipantKey(p);
      const prevStatus = prevStatusByKey.get(key);
      if (
        prevStatus &&
        isCalledLikeStatus(prevStatus) &&
        p.status === "PENDING" &&
        !isDayOpsTerminalParticipantStatus(prevStatus)
      ) {
        return { ...p, status: prevStatus };
      }
      return p;
    }),
  }));
}

/** summary=1 の締切状態を既存 heats にマージ（参加者行は維持） */
export function mergeMarshalHeatSummaryLayer(
  prev: HeatMarshalHeatRow[] | null | undefined,
  summaryHeats: HeatMarshalHeatRow[]
): HeatMarshalHeatRow[] {
  if (summaryHeats.length === 0) return prev ?? [];
  const summaryByIndex = new Map(summaryHeats.map((h) => [h.heatIndex, h]));
  if (prev?.length) {
    const seen = new Set<number>();
    const merged = prev.map((h) => {
      const summary = summaryByIndex.get(h.heatIndex);
      seen.add(h.heatIndex);
      if (!summary) return h;
      return {
        ...h,
        callClosedAt: summary.callClosedAt,
        marshalReopenBlocked: summary.marshalReopenBlocked ?? h.marshalReopenBlocked,
      };
    });
    for (const summary of summaryHeats) {
      if (!seen.has(summary.heatIndex)) {
        merged.push({ ...summary, participants: summary.participants ?? [] });
      }
    }
    return merged.sort((a, b) => a.heatIndex - b.heatIndex);
  }
  return summaryHeats.map((h) => ({ ...h, participants: h.participants ?? [] }));
}

/** 同一チームの `T:teamId:userId` 行を `buildParticipantDayOpsStatusByKey` 相当に畳む。レガシー `T:teamId` のみのときはその値。 */
export function foldTeamServerStatusFromMemberKeys(
  teamEntryId: string,
  statusByKey: Record<string, string> | undefined
): string | undefined {
  if (!statusByKey) return undefined;
  const prefix = `${marshalTeamLegacyKey(teamEntryId)}:`;
  const statuses: string[] = [];
  let legacy: string | undefined;
  for (const [k, v] of Object.entries(statusByKey)) {
    if (k === marshalTeamLegacyKey(teamEntryId)) legacy = v;
    else if (k.startsWith(prefix)) statuses.push(v);
  }
  if (statuses.length > 0) {
    return foldTeamMemberStatuses(statuses);
  }
  return legacy;
}

export function marshalParticipantForLane(
  apiHeat: HeatMarshalHeatRow | undefined,
  laneNumber: number,
  laneIndex0: number
): HeatMarshalParticipant | undefined {
  if (!apiHeat?.participants?.length) return undefined;
  const sameLane = apiHeat.participants.filter((p) => p.lane === laneNumber);
  if (sameLane.length === 0) {
    return apiHeat.participants[laneIndex0];
  }
  if (sameLane.length === 1) return sameLane[0];
  const teamId = sameLane[0]?.teamEntryId;
  if (
    teamId &&
    sameLane.every((p) => p.participantType === "TEAM" && p.teamEntryId === teamId)
  ) {
    const status = foldTeamMarshalStatuses(sameLane);
    return { ...sameLane[0]!, status };
  }
  return sameLane[0];
}

/** 一覧ソート用: サーバー着順、なければ未確定チェックの仮着順 */
export function effectiveResultSortRank(
  heatIndex1Based: number,
  participant: HeatMarshalParticipant | undefined,
  apiHeat: HeatMarshalHeatRow | undefined,
  rows: HeatResultCaptureRow[],
  drafts: Record<
    string,
    { heatIndex: number; draftSequence?: number; tieWithPrevious?: boolean }
  >,
  inputOrder: "asc" | "desc"
): number | null {
  const server = resultRankForParticipant(heatIndex1Based, participant, rows);
  if (server != null) return server;
  return provisionalResultRankForParticipant(
    heatIndex1Based,
    participant,
    apiHeat,
    rows,
    drafts,
    inputOrder
  );
}

export function resultRankForParticipant(
  heatIndex1Based: number,
  participant: HeatMarshalParticipant | undefined,
  rows: HeatResultCaptureRow[]
): number | null {
  if (!participant) return null;
  const match = rows.find((r) => {
    if (r.rank == null) return false;
    const entryMatch =
      participant.participantType === "INDIVIDUAL"
        ? r.entryType === "INDIVIDUAL" && r.competitionEntryId === participant.competitionEntryId
        : r.entryType === "TEAM" && r.teamEntryId === participant.teamEntryId;
    if (!entryMatch) return false;
    if (typeof r.heat === "number" && r.heat >= 1) {
      return r.heat === heatIndex1Based;
    }
    return true;
  });
  return match?.rank ?? null;
}

/**
 * 未 append のチェックのみのときの仮着順。`draftSequence` 昇順で割り当て、同着は直前行と同 rank。
 */
export function provisionalResultRankForParticipant(
  heatIndex: number,
  participant: HeatMarshalParticipant | undefined,
  apiHeat: HeatMarshalHeatRow | undefined,
  rows: HeatResultCaptureRow[],
  drafts: Record<
    string,
    { heatIndex: number; draftSequence?: number; tieWithPrevious?: boolean }
  >,
  inputOrder: "asc" | "desc"
): number | null {
  if (!participant) return null;
  const pKey = marshalParticipantKey(participant);
  const mine = drafts[pKey];
  if (!mine || mine.heatIndex !== heatIndex) return null;

  const calledN = countCalledInMarshalHeat(apiHeat);
  if (calledN <= 0) return null;

  const serverRanks = rows
    .filter((r) => r.heat === heatIndex && r.rank != null)
    .map((r) => r.rank as number);

  const exclude = terminalParticipantKeysForHeat(apiHeat);
  const draftInputs = Object.entries(drafts)
    .filter(([key, op]) => op.heatIndex === heatIndex && !exclude.has(key))
    .map(([key, op]) => ({
      key,
      seq: op.draftSequence ?? 0,
      tieWithPrevious: op.tieWithPrevious === true,
    }));

  const keyToRank = computeProvisionalDraftRanks({
    serverRanks,
    drafts: draftInputs,
    inputOrder,
    calledN,
  });
  return keyToRank.get(pKey) ?? null;
}

export function countCalledInMarshalHeat(apiHeat: HeatMarshalHeatRow | undefined): number {
  if (!apiHeat?.participants?.length) return 0;
  const byTeam = new Map<string, HeatMarshalParticipant[]>();
  let indiv = 0;
  for (const p of apiHeat.participants) {
    if (p.participantType === "INDIVIDUAL") {
      if (isCalledLikeStatus(p.status)) indiv += 1;
    } else if (p.teamEntryId) {
      const list = byTeam.get(p.teamEntryId) ?? [];
      list.push(p);
      byTeam.set(p.teamEntryId, list);
    }
  }
  let teams = 0;
  for (const [, rows] of byTeam) {
    if (isTeamFullyCalled(rows.map((r) => r.status))) teams += 1;
  }
  return indiv + teams;
}

export function participantKeyFromResultRow(r: HeatResultCaptureRow): string | null {
  return resultParticipantKeyFromParts(r.entryType, r.competitionEntryId, r.teamEntryId);
}

export function marshalCalledParticipantKeys(apiHeat: HeatMarshalHeatRow | undefined): Set<string> {
  const keys = new Set<string>();
  if (!apiHeat?.participants?.length) return keys;
  const byTeam = new Map<string, HeatMarshalParticipant[]>();
  for (const p of apiHeat.participants) {
    if (p.participantType === "INDIVIDUAL") {
      if (isCalledLikeStatus(p.status) && p.competitionEntryId) {
        keys.add(marshalIndividualKey(p.competitionEntryId));
      }
    } else if (p.teamEntryId) {
      const list = byTeam.get(p.teamEntryId) ?? [];
      list.push(p);
      byTeam.set(p.teamEntryId, list);
    }
  }
  for (const [tid, rows] of byTeam) {
    if (isTeamFullyCalled(rows.map((r) => r.status))) {
      keys.add(marshalTeamLegacyKey(tid));
    }
  }
  return keys;
}

/**
 * 着順が入っている行数（ヒート別）。公式行の heat が null のときは当該マーシャルヒートの CALLED 参加者に紐づけ、
 * 次ラ生成（スナップショット基準のヒート解決）と「次ラ進出」表示を揃える。
 */
export function countOkRanksForHeat(
  rows: HeatResultCaptureRow[],
  heatIndex1Based: number,
  apiHeat: HeatMarshalHeatRow | undefined
): number {
  const calledHere = marshalCalledParticipantKeys(apiHeat);
  let n = 0;
  for (const r of rows) {
    if (r.rank == null) continue;
    if (typeof r.heat === "number" && r.heat >= 1) {
      if (r.heat === heatIndex1Based) n += 1;
      continue;
    }
    const k = participantKeyFromResultRow(r);
    if (k && calledHere.has(k)) n += 1;
  }
  return n;
}

/** 次ラ進出の目安人数（アップ枠・召集済み・着順/ランアップ記録の最小）。 */
export function effectiveNextRoundAdvanceCount(
  quota: number,
  rankOkCount: number,
  calledCount: number,
  runUpCount = 0
): number {
  return Math.min(quota, rankOkCount + runUpCount, calledCount);
}

export function countRunUpForHeat(
  rows: HeatResultCaptureRow[],
  heatIndex1Based: number,
  apiHeat: HeatMarshalHeatRow | undefined
): number {
  const calledHere = marshalCalledParticipantKeys(apiHeat);
  let n = 0;
  for (const r of rows) {
    if (!r.advanceWithoutRank) continue;
    if (typeof r.heat === "number" && r.heat >= 1) {
      if (r.heat === heatIndex1Based) n += 1;
      continue;
    }
    const k = participantKeyFromResultRow(r);
    if (k && calledHere.has(k)) n += 1;
  }
  return n;
}

export function participantHasRunUpInHeat(
  heatIndex1Based: number,
  participant: HeatMarshalParticipant | undefined,
  rows: HeatResultCaptureRow[]
): boolean {
  if (!participant) return false;
  const match = rows.find((r) => {
    if (!r.advanceWithoutRank) return false;
    const entryMatch =
      participant.participantType === "INDIVIDUAL"
        ? r.entryType === "INDIVIDUAL" && r.competitionEntryId === participant.competitionEntryId
        : r.entryType === "TEAM" && r.teamEntryId === participant.teamEntryId;
    if (!entryMatch) return false;
    if (typeof r.heat === "number" && r.heat >= 1) {
      return r.heat === heatIndex1Based;
    }
    return true;
  });
  return Boolean(match);
}

export {
  canApplyRunUp,
  eliminationSlots,
  heatUsesEliminationRunUp,
  isEliminationStyleResultInput,
  isHeatResultReadyForConfirm,
} from "@/lib/heatResultEliminationRunUp";

export function HeatAdvanceQuotaLabel({
  quota,
  resultCaptureVisible,
  rankOkCount,
  runUpCount = 0,
  calledCount,
  hasApiHeat,
}: {
  quota: number;
  resultCaptureVisible: boolean;
  rankOkCount: number;
  runUpCount?: number;
  calledCount: number;
  hasApiHeat: boolean;
}) {
  if (resultCaptureVisible) {
    const called = hasApiHeat ? calledCount : Number.POSITIVE_INFINITY;
    const eff = effectiveNextRoundAdvanceCount(quota, rankOkCount, called, runUpCount);
    return (
      <span className="ml-1.5 font-normal text-gray-600 dark:text-gray-400">
        · 次ラ進出{" "}
        <span className="font-semibold tabular-nums text-foreground">{eff}</span> 名
        {eff < quota ? (
          <span className="text-muted-foreground">（枠 {quota}）</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="ml-1.5 font-normal text-gray-600 dark:text-gray-400">· 按分試算 {quota} 名</span>
  );
}

/** スタートリスト上の氏名・チーム名の色（マーシャル状態） */
export function marshalDisplayClass(status: string | undefined): string {
  if (!status) return "";
  if (isCalledLikeStatus(status)) {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (status === "DNS" || status === "DSQ") {
    return "text-muted-foreground line-through decoration-muted-foreground/70";
  }
  return "";
}

export function LaneRow({
  laneNumber,
  children,
  contentClassName,
  contentTitle,
}: {
  laneNumber: number;
  children: ReactNode;
  contentClassName?: string;
  /** ホバー時の説明（例: 召集済み） */
  contentTitle?: string;
}) {
  return (
    <li className="flex gap-1.5 items-baseline">
      <span
        className="shrink-0 w-5 text-right text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400"
        aria-label={`レーン ${laneNumber}`}
      >
        {laneNumber}
      </span>
      <div className={cn("min-w-0 flex-1", contentClassName)} title={contentTitle}>
        {children}
      </div>
    </li>
  );
}

/** @deprecated use sexLabelJa from @/lib/sexLabelJa */
export const sexLabel = sexLabelJa;

/** 通常リスト行: 氏名＋終了系ステータスバッジ */
export function StartListParticipantRowBody({
  status,
  children,
}: {
  status: string | undefined;
  children: ReactNode;
}) {
  const showBadge = Boolean(status && isDayOpsTerminalParticipantStatus(status));
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <div className="min-w-0 flex-1">{children}</div>
      {showBadge && status ? (
        <span
          className={cn(
            "inline-flex shrink-0 self-start rounded border px-1 py-px text-[10px] font-semibold tabular-nums leading-tight",
            dayOpsTerminalStatusBadgeClass(status)
          )}
        >
          {dayOpsParticipantStatusLabelJa(status)}
        </span>
      ) : null}
    </div>
  );
}
export function individualLiveRowLabel(name: string, clubName?: string | null) {
  const club = secondaryClubLineForIndividual(clubName);
  return (
    <>
      <span className="font-medium">{name}</span>
      {club ? <span className="ml-2 text-xs text-muted-foreground">（{club}）</span> : null}
    </>
  );
}

export type ConfirmedHeatSortCtx = {
  displayHeatNumber: number;
  rows: HeatResultCaptureRow[];
  statusByKey: Record<string, string>;
  apiHeat?: HeatMarshalHeatRow;
};

export type LiveHeatSortCtx = ConfirmedHeatSortCtx & {
  resultDraftOps?: Record<
    string,
    { heatIndex: number; draftSequence?: number; tieWithPrevious?: boolean }
  >;
  resultInputOrder?: "asc" | "desc";
  includeProvisional?: boolean;
};

export type LiveResultRankSortOpts = {
  displayHeatNumber: number;
  rows: HeatResultCaptureRow[];
  statusByKey?: Record<string, string>;
  apiHeat?: HeatMarshalHeatRow;
  resultDraftOps?: LiveHeatSortCtx["resultDraftOps"];
  resultInputOrder?: "asc" | "desc";
  includeProvisional?: boolean;
};

function confirmedResultRowForIndividual(
  entryId: string,
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[]
): HeatResultCaptureRow | undefined {
  return rows.find(
    (x) =>
      x.entryType === "INDIVIDUAL" &&
      x.competitionEntryId === entryId &&
      (typeof x.heat === "number" && x.heat >= 1 ? x.heat === displayHeatNumber : true)
  );
}

function confirmedResultRowForTeam(
  teamEntryId: string,
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[]
): HeatResultCaptureRow | undefined {
  return rows.find(
    (x) =>
      x.entryType === "TEAM" &&
      x.teamEntryId === teamEntryId &&
      (typeof x.heat === "number" && x.heat >= 1 ? x.heat === displayHeatNumber : true)
  );
}

function marshalParticipantForIndividual(
  apiHeat: HeatMarshalHeatRow | undefined,
  entryId: string
): HeatMarshalParticipant | undefined {
  return apiHeat?.participants.find(
    (p) => p.participantType === "INDIVIDUAL" && p.competitionEntryId === entryId
  );
}

function marshalParticipantForTeam(
  apiHeat: HeatMarshalHeatRow | undefined,
  teamEntryId: string
): HeatMarshalParticipant | undefined {
  const rows =
    apiHeat?.participants.filter(
      (p) => p.participantType === "TEAM" && p.teamEntryId === teamEntryId
    ) ?? [];
  if (rows.length === 0) return undefined;
  return { ...rows[0]!, status: foldTeamMarshalStatuses(rows) };
}

export function effectiveResultRankForIndividual(
  entryId: string,
  ctx: LiveHeatSortCtx
): number | null {
  const participant = marshalParticipantForIndividual(ctx.apiHeat, entryId);
  return effectiveResultSortRank(
    ctx.displayHeatNumber,
    participant,
    ctx.apiHeat,
    ctx.rows,
    ctx.resultDraftOps ?? {},
    ctx.resultInputOrder ?? "asc"
  );
}

export function effectiveResultRankForTeam(
  teamEntryId: string,
  ctx: LiveHeatSortCtx
): number | null {
  const participant = marshalParticipantForTeam(ctx.apiHeat, teamEntryId);
  return effectiveResultSortRank(
    ctx.displayHeatNumber,
    participant,
    ctx.apiHeat,
    ctx.rows,
    ctx.resultDraftOps ?? {},
    ctx.resultInputOrder ?? "asc"
  );
}

/** 0=進出, 1=着順, 2=DNF, 3=ターミナル/その他 */
export function liveResultSortTierForIndividual(entryId: string, ctx: LiveHeatSortCtx): number {
  const row = confirmedResultRowForIndividual(entryId, ctx.displayHeatNumber, ctx.rows);
  if (row?.advanceWithoutRank) return 0;
  const rank = ctx.includeProvisional
    ? effectiveResultRankForIndividual(entryId, ctx)
    : (row?.rank ?? null);
  if (rank != null) return 1;
  const st = ctx.statusByKey[marshalIndividualKey(entryId)];
  if (st === "DNF") return 2;
  if (st && isDayOpsTerminalParticipantStatus(st)) return 3;
  return 3;
}

/** 0=進出, 1=着順, 2=DNF, 3=ターミナル/その他 */
export function liveResultSortTierForTeam(teamEntryId: string, ctx: LiveHeatSortCtx): number {
  const row = confirmedResultRowForTeam(teamEntryId, ctx.displayHeatNumber, ctx.rows);
  if (row?.advanceWithoutRank) return 0;
  const rank = ctx.includeProvisional
    ? effectiveResultRankForTeam(teamEntryId, ctx)
    : (row?.rank ?? null);
  if (rank != null) return 1;
  const st = foldTeamServerStatusFromMemberKeys(teamEntryId, ctx.statusByKey);
  if (st === "DNF") return 2;
  if (st && isDayOpsTerminalParticipantStatus(st)) return 3;
  return 3;
}

/** @deprecated use liveResultSortTierForIndividual with includeProvisional: false */
export function confirmedResultSortTierForIndividual(
  entryId: string,
  ctx: ConfirmedHeatSortCtx
): number {
  return liveResultSortTierForIndividual(entryId, { ...ctx, includeProvisional: false });
}

/** @deprecated use liveResultSortTierForTeam with includeProvisional: false */
export function confirmedResultSortTierForTeam(
  teamEntryId: string,
  ctx: ConfirmedHeatSortCtx
): number {
  return liveResultSortTierForTeam(teamEntryId, { ...ctx, includeProvisional: false });
}

function compareLiveIndividualItems(
  a: IndividualItem,
  b: IndividualItem,
  ctx: LiveHeatSortCtx
): number {
  const tierA = liveResultSortTierForIndividual(a.entryId, ctx);
  const tierB = liveResultSortTierForIndividual(b.entryId, ctx);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0) {
    const laneA = snapshotLaneForIndividual(ctx.apiHeat, a.entryId, 100_000);
    const laneB = snapshotLaneForIndividual(ctx.apiHeat, b.entryId, 100_000);
    return laneA - laneB || a.entryId.localeCompare(b.entryId);
  }
  if (tierA === 1) {
    const rankA = ctx.includeProvisional
      ? (effectiveResultRankForIndividual(a.entryId, ctx) ?? 100_000)
      : (confirmedResultRowForIndividual(a.entryId, ctx.displayHeatNumber, ctx.rows)?.rank ??
        100_000);
    const rankB = ctx.includeProvisional
      ? (effectiveResultRankForIndividual(b.entryId, ctx) ?? 100_000)
      : (confirmedResultRowForIndividual(b.entryId, ctx.displayHeatNumber, ctx.rows)?.rank ??
        100_000);
    return rankA - rankB || a.entryId.localeCompare(b.entryId);
  }
  if (tierA === 3) {
    const laneA = snapshotLaneForIndividual(ctx.apiHeat, a.entryId, 100_000);
    const laneB = snapshotLaneForIndividual(ctx.apiHeat, b.entryId, 100_000);
    return laneA - laneB || a.entryId.localeCompare(b.entryId);
  }
  return a.entryId.localeCompare(b.entryId);
}

function compareLiveTeamItems(a: TeamItem, b: TeamItem, ctx: LiveHeatSortCtx): number {
  const tierA = liveResultSortTierForTeam(a.teamEntryId, ctx);
  const tierB = liveResultSortTierForTeam(b.teamEntryId, ctx);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0) {
    const laneA = snapshotLaneForTeam(ctx.apiHeat, a.teamEntryId, 100_000);
    const laneB = snapshotLaneForTeam(ctx.apiHeat, b.teamEntryId, 100_000);
    return laneA - laneB || a.teamEntryId.localeCompare(b.teamEntryId);
  }
  if (tierA === 1) {
    const rankA = ctx.includeProvisional
      ? (effectiveResultRankForTeam(a.teamEntryId, ctx) ?? 100_000)
      : (confirmedResultRowForTeam(a.teamEntryId, ctx.displayHeatNumber, ctx.rows)?.rank ??
        100_000);
    const rankB = ctx.includeProvisional
      ? (effectiveResultRankForTeam(b.teamEntryId, ctx) ?? 100_000)
      : (confirmedResultRowForTeam(b.teamEntryId, ctx.displayHeatNumber, ctx.rows)?.rank ??
        100_000);
    return rankA - rankB || a.teamEntryId.localeCompare(b.teamEntryId);
  }
  if (tierA === 3) {
    const laneA = snapshotLaneForTeam(ctx.apiHeat, a.teamEntryId, 100_000);
    const laneB = snapshotLaneForTeam(ctx.apiHeat, b.teamEntryId, 100_000);
    return laneA - laneB || a.teamEntryId.localeCompare(b.teamEntryId);
  }
  return a.teamEntryId.localeCompare(b.teamEntryId);
}

function liveHeatSortCtxFromOpts(opts: LiveResultRankSortOpts): LiveHeatSortCtx {
  return {
    displayHeatNumber: opts.displayHeatNumber,
    rows: opts.rows,
    statusByKey: opts.statusByKey ?? {},
    apiHeat: opts.apiHeat,
    resultDraftOps: opts.resultDraftOps,
    resultInputOrder: opts.resultInputOrder,
    includeProvisional: opts.includeProvisional,
  };
}

export function orderIndividualItemsByLiveResultRank(
  items: IndividualItem[],
  opts: LiveResultRankSortOpts
): IndividualItem[] {
  const ctx = liveHeatSortCtxFromOpts(opts);
  return [...items].sort((a, b) => compareLiveIndividualItems(a, b, ctx));
}

export function orderTeamItemsByLiveResultRank(
  items: TeamItem[],
  opts: LiveResultRankSortOpts
): TeamItem[] {
  const ctx = liveHeatSortCtxFromOpts(opts);
  return [...items].sort((a, b) => compareLiveTeamItems(a, b, ctx));
}

export function orderIndividualItemsByConfirmedResultRank(
  items: IndividualItem[],
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[],
  statusByKey: Record<string, string> = {},
  apiHeat?: HeatMarshalHeatRow
): IndividualItem[] {
  return orderIndividualItemsByLiveResultRank(items, {
    displayHeatNumber,
    rows,
    statusByKey,
    apiHeat,
    includeProvisional: false,
  });
}

export function orderTeamItemsByConfirmedResultRank(
  items: TeamItem[],
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[],
  statusByKey: Record<string, string> = {},
  apiHeat?: HeatMarshalHeatRow
): TeamItem[] {
  return orderTeamItemsByLiveResultRank(items, {
    displayHeatNumber,
    rows,
    statusByKey,
    apiHeat,
    includeProvisional: false,
  });
}

export function snapshotLaneForIndividual(
  apiHeat: HeatMarshalHeatRow | undefined,
  entryId: string,
  fallLane: number
): number {
  const p = apiHeat?.participants.find(
    (x) => x.participantType === "INDIVIDUAL" && x.competitionEntryId === entryId
  );
  return p?.lane ?? fallLane;
}

export function snapshotLaneForTeam(
  apiHeat: HeatMarshalHeatRow | undefined,
  teamEntryId: string,
  fallLane: number
): number {
  const p = apiHeat?.participants.find((x) => x.participantType === "TEAM" && x.teamEntryId === teamEntryId);
  return p?.lane ?? fallLane;
}

/** JSON 由来の heatIndex が string でも一致する。マーシャル API と表示用 heat 番号の突合に使う */
export function marshalHeatMatchesDisplayIndex(h: HeatMarshalHeatRow, displayHeatNumber: number): boolean {
  return Number(h.heatIndex) === Number(displayHeatNumber);
}

/** ヒート締切/再開の楽観更新（締切時の DNS 付与はサーバー側で行う） */
export function patchHeatMarshalCallWindowInHeats(
  heats: HeatMarshalHeatRow[],
  displayHeatNumber: number,
  callClosed: boolean
): HeatMarshalHeatRow[] {
  const callClosedAt = callClosed ? new Date().toISOString() : null;
  return heats.map((h) => {
    if (!marshalHeatMatchesDisplayIndex(h, displayHeatNumber)) return h;
    return {
      ...h,
      callClosedAt,
      participants: h.participants.map((p) => ({
        ...p,
        status: effectiveDayOpsStatusForMarshalDisplay(p.status, callClosed),
      })),
    };
  });
}
