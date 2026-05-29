import type { ResultRound } from "@prisma/client";
import type { ReactNode } from "react";
import type { HeatMarshalHeatRow, HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import { marshalParticipantKey } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { secondaryClubLabelForTeamRow, secondaryClubLineForIndividual } from "@/lib/startListTeamDisplay";
import {
  DAY_OPS_STATUS_MARSHAL_ABSENT,
  dayOpsParticipantStatusLabelJa,
  dayOpsTerminalStatusBadgeClass,
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
import { cn } from "@/lib/utils";
import { sexLabelJa } from "@/lib/sexLabelJa";
import type { IndividualItem, SnapshotParticipant, TeamItem } from "./types";

export function foldTeamMarshalStatuses(rows: HeatMarshalParticipant[]): string {
  return foldTeamMemberStatuses(rows.map((r) => r.status));
}

export function applyMarshalDraftOpsToHeats(
  heats: HeatMarshalHeatRow[],
  draftOps: Record<string, { opKey: string; heatIndex: number; status: "CALLED" | "PENDING" }>
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
 * 未 append のチェックのみのときの仮着順。`draftSequence` の昇順で昇順入力は空き番の小さい方から、
 * 降順入力は空き番の大きい方から割り当てる。
 */
export function provisionalResultRankForParticipant(
  heatIndex: number,
  participant: HeatMarshalParticipant | undefined,
  apiHeat: HeatMarshalHeatRow | undefined,
  rows: HeatResultCaptureRow[],
  drafts: Record<string, { heatIndex: number; draftSequence?: number }>,
  inputOrder: "asc" | "desc"
): number | null {
  if (!participant) return null;
  const pKey = marshalParticipantKey(participant);
  const mine = drafts[pKey];
  if (!mine || mine.heatIndex !== heatIndex) return null;

  const calledN = countCalledInMarshalHeat(apiHeat);
  if (calledN <= 0) return null;

  const used = new Set(
    rows.filter((r) => r.heat === heatIndex && r.rank != null).map((r) => r.rank as number)
  );

  const draftsInHeat = Object.entries(drafts)
    .filter(([, op]) => op.heatIndex === heatIndex)
    .map(([key, op]) => ({ key, seq: op.draftSequence ?? 0 }))
    .sort((a, b) => a.seq - b.seq || a.key.localeCompare(b.key));

  const keyToRank = new Map<string, number>();
  for (const { key } of draftsInHeat) {
    if (inputOrder === "asc") {
      let r = 1;
      while (r <= calledN && used.has(r)) r++;
      if (r > calledN) break;
      used.add(r);
      keyToRank.set(key, r);
    } else {
      let r = calledN;
      while (r >= 1 && used.has(r)) r--;
      if (r < 1) break;
      used.add(r);
      keyToRank.set(key, r);
    }
  }
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
  if (
    status === "DNS" ||
    status === "DSQ" ||
    status === "WITHDRAWN" ||
    status === DAY_OPS_STATUS_MARSHAL_ABSENT
  ) {
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

export function orderIndividualItemsByConfirmedResultRank(
  items: IndividualItem[],
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[]
): IndividualItem[] {
  const rankOf = (entryId: string): number => {
    const r = rows.find(
      (x) =>
        x.rank != null &&
        x.entryType === "INDIVIDUAL" &&
        x.competitionEntryId === entryId &&
        (typeof x.heat === "number" && x.heat >= 1
          ? x.heat === displayHeatNumber
          : true)
    );
    return r?.rank ?? 100_000;
  };
  return [...items].sort((a, b) => {
    const d = rankOf(a.entryId) - rankOf(b.entryId);
    if (d !== 0) return d;
    return a.entryId.localeCompare(b.entryId);
  });
}

export function orderTeamItemsByConfirmedResultRank(
  items: TeamItem[],
  displayHeatNumber: number,
  rows: HeatResultCaptureRow[]
): TeamItem[] {
  const rankOf = (teamEntryId: string): number => {
    const r = rows.find(
      (x) =>
        x.rank != null &&
        x.entryType === "TEAM" &&
        x.teamEntryId === teamEntryId &&
        (typeof x.heat === "number" && x.heat >= 1
          ? x.heat === displayHeatNumber
          : true)
    );
    return r?.rank ?? 100_000;
  };
  return [...items].sort((a, b) => {
    const d = rankOf(a.teamEntryId) - rankOf(b.teamEntryId);
    if (d !== 0) return d;
    return a.teamEntryId.localeCompare(b.teamEntryId);
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
