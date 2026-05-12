"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResultRound } from "@prisma/client";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  marshalParticipantKey,
  type HeatMarshalHeatRow,
  type HeatMarshalParticipant,
} from "@/components/HeatMarshalLanePanel";
import {
  MarshalStartListLaneCheckbox,
  type MarshalDraftTogglePayload,
  type MarshalResultPayload,
} from "@/components/MarshalStartListWidgets";
import { ResultStartListLaneCheckbox } from "@/components/ResultStartListWidgets";
import {
  postHeatResultCaptureAppend,
  postHeatResultConfirmHeat,
  postHeatResultReorder,
  type HeatResultCaptureRow,
} from "@/lib/heatResultCaptureApi";
import { postHeatMarshalComplete, postParticipantStatusesBulk } from "@/lib/heatMarshalApi";
import {
  buildParticipantStatusRecordForRound,
  type ParticipantStatusRowForScope,
} from "@/lib/competitionParticipantStatusScope";
import {
  DAY_OPS_STATUS_MARSHAL_ABSENT,
  dayOpsParticipantStatusLabelJa,
  dayOpsTerminalStatusBadgeClass,
  dispatchJlaDayOpsParticipantStatusChanged,
  isDayOpsTerminalParticipantStatus,
  resolveHeatLaneDayOpsDisplayStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { isNfcScanSupportedSync, startNfcScanSession } from "@/lib/nfc/nfcScanSession";
import {
  deleteHeatOperationDraftFireAndForget,
  getHeatOperationDraft,
  isDayOpsResultDraftServerSyncEnabled,
  parseServerResultDraftPayload,
  patchHeatOperationDraftResultPayloadFireAndForget,
  type HeatResultDraftServerEntry,
} from "@/lib/dayOpsHeatOperationDraftSync";
import {
  secondaryClubLabelForTeamRow,
  secondaryClubLineForIndividual,
} from "@/lib/startListTeamDisplay";
import { cn } from "@/lib/utils";

function foldTeamMarshalStatuses(rows: HeatMarshalParticipant[]): string {
  if (rows.length === 0) return "PENDING";
  const s = rows.map((r) => r.status);
  if (s.some((x) => x === "DSQ")) return "DSQ";
  if (s.some((x) => x === "DNS" || x === "WITHDRAWN")) return "DNS";
  if (s.every((x) => x === "CALLED" || x === "CHECKED_IN")) return "CALLED";
  if (s.some((x) => x === "MARSHAL_ABSENT")) return "MARSHAL_ABSENT";
  return "PENDING";
}

function applyMarshalDraftOpsToHeats(
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
function foldTeamServerStatusFromMemberKeys(
  teamEntryId: string,
  statusByKey: Record<string, string> | undefined
): string | undefined {
  if (!statusByKey) return undefined;
  const prefix = `T:${teamEntryId}:`;
  const statuses: string[] = [];
  let legacy: string | undefined;
  for (const [k, v] of Object.entries(statusByKey)) {
    if (k === `T:${teamEntryId}`) legacy = v;
    else if (k.startsWith(prefix)) statuses.push(v);
  }
  if (statuses.length > 0) {
    if (statuses.some((s) => s === "DSQ")) return "DSQ";
    if (statuses.some((s) => s === "DNS" || s === "WITHDRAWN")) return "DNS";
    if (statuses.every((s) => s === "CALLED" || s === "CHECKED_IN")) return "CALLED";
    if (statuses.some((s) => s === "MARSHAL_ABSENT")) return "MARSHAL_ABSENT";
    return "PENDING";
  }
  return legacy;
}

function marshalParticipantForLane(
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

function resultRankForParticipant(
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
function provisionalResultRankForParticipant(
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

function countCalledInMarshalHeat(apiHeat: HeatMarshalHeatRow | undefined): number {
  if (!apiHeat?.participants?.length) return 0;
  const byTeam = new Map<string, HeatMarshalParticipant[]>();
  let indiv = 0;
  for (const p of apiHeat.participants) {
    if (p.participantType === "INDIVIDUAL") {
      if (p.status === "CALLED") indiv += 1;
    } else if (p.teamEntryId) {
      const list = byTeam.get(p.teamEntryId) ?? [];
      list.push(p);
      byTeam.set(p.teamEntryId, list);
    }
  }
  let teams = 0;
  for (const [, rows] of byTeam) {
    if (rows.length > 0 && rows.every((r) => r.status === "CALLED")) teams += 1;
  }
  return indiv + teams;
}

function participantKeyFromResultRow(r: HeatResultCaptureRow): string | null {
  if (r.entryType === "INDIVIDUAL" && r.competitionEntryId) {
    return `I:${r.competitionEntryId}`;
  }
  if (r.entryType === "TEAM" && r.teamEntryId) {
    return `T:${r.teamEntryId}`;
  }
  return null;
}

function marshalCalledParticipantKeys(apiHeat: HeatMarshalHeatRow | undefined): Set<string> {
  const keys = new Set<string>();
  if (!apiHeat?.participants?.length) return keys;
  const byTeam = new Map<string, HeatMarshalParticipant[]>();
  for (const p of apiHeat.participants) {
    if (p.participantType === "INDIVIDUAL") {
      if (p.status === "CALLED" && p.competitionEntryId) {
        keys.add(`I:${p.competitionEntryId}`);
      }
    } else if (p.teamEntryId) {
      const list = byTeam.get(p.teamEntryId) ?? [];
      list.push(p);
      byTeam.set(p.teamEntryId, list);
    }
  }
  for (const [tid, rows] of byTeam) {
    if (rows.length > 0 && rows.every((r) => r.status === "CALLED")) {
      keys.add(`T:${tid}`);
    }
  }
  return keys;
}

/**
 * 着順が入っている行数（ヒート別）。公式行の heat が null のときは当該マーシャルヒートの CALLED 参加者に紐づけ、
 * 次ラ生成（スナップショット基準のヒート解決）と「次ラ進出」表示を揃える。
 */
function countOkRanksForHeat(
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

/** 次ラ進出の目安人数（アップ枠・召集済み・着順記録の最小）。次ラ生成の collectAdvancersPerHeatByRank と整合。 */
function effectiveNextRoundAdvanceCount(
  quota: number,
  rankOkCount: number,
  calledCount: number
): number {
  return Math.min(quota, rankOkCount, calledCount);
}

function HeatAdvanceQuotaLabel({
  quota,
  resultCaptureVisible,
  rankOkCount,
  calledCount,
  hasApiHeat,
}: {
  quota: number;
  resultCaptureVisible: boolean;
  rankOkCount: number;
  calledCount: number;
  hasApiHeat: boolean;
}) {
  if (resultCaptureVisible) {
    const called = hasApiHeat ? calledCount : Number.POSITIVE_INFINITY;
    const eff = effectiveNextRoundAdvanceCount(quota, rankOkCount, called);
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
    <span className="ml-1.5 font-normal text-gray-600 dark:text-gray-400">· アップ {quota} 名</span>
  );
}

/** スタートリスト上の氏名・チーム名の色（マーシャル状態） */
function marshalDisplayClass(status: string | undefined): string {
  if (!status) return "";
  if (status === "CALLED") {
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

function LaneRow({
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

const sexLabel = (sex?: string | null) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

/** 通常リスト行: 氏名＋終了系ステータスバッジ */
function StartListParticipantRowBody({
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

export type SnapshotParticipant =
  | {
      kind: "INDIVIDUAL";
      name: string;
      entryId?: string;
      clubName?: string | null;
    }
  | {
      kind: "TEAM";
      teamName: string;
      clubName?: string | null;
      members?: string[];
    };

export type SnapshotRoundBlock = {
  round: "HEAT" | "SEMI" | "FINAL";
  heats: Array<{
    heatIndex: number;
    /** スナップショット JSON 由来のため緩い型 */
    participants: unknown[];
  }>;
};

export function SnapshotRoundContent({
  eventId,
  roundBlock,
  withdrawnKeySet,
}: {
  eventId: string;
  roundBlock: SnapshotRoundBlock;
  withdrawnKeySet: Set<string>;
}) {
  const heatsOrdered = [...roundBlock.heats].sort((a, b) => a.heatIndex - b.heatIndex);
  return (
    <div className="space-y-1.5">
      {heatsOrdered.map((heat) => {
        const visibleParticipants = heat.participants.filter((p) => {
          const participant = p as SnapshotParticipant;
          if (participant.kind !== "INDIVIDUAL") return true;
          const eid = participant.entryId;
          if (!eid) return true;
          return !withdrawnKeySet.has(`${eid}:${eventId}`);
        });
        return (
          <div
            key={`${eventId}-${roundBlock.round}-heat-${heat.heatIndex}`}
            className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
          >
            <p className="text-xs font-semibold text-muted-foreground">
              ヒート {heat.heatIndex}（{visibleParticipants.length}件）
            </p>
            <ul className="mt-1 space-y-0.5">
              {visibleParticipants.map((p, index) => {
                const participant = p as SnapshotParticipant;
                const lane = index + 1;
                if (participant.kind === "TEAM") {
                  const clubSecondary = secondaryClubLabelForTeamRow(
                    participant.teamName,
                    participant.clubName
                  );
                  return (
                    <LaneRow key={`team-${heat.heatIndex}-${index}`} laneNumber={lane}>
                      <p className="font-medium">
                        {participant.teamName}
                        {clubSecondary ? (
                          <span className="ml-2 text-xs text-gray-500">({clubSecondary})</span>
                        ) : null}
                      </p>
                      {participant.members && participant.members.length > 0 && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {participant.members.join(" / ")}
                        </div>
                      )}
                    </LaneRow>
                  );
                }
                const indClub = secondaryClubLineForIndividual(participant.clubName);
                return (
                  <LaneRow key={`ind-${heat.heatIndex}-${index}`} laneNumber={lane}>
                    <span className="font-medium">{participant.name}</span>
                    {indClub ? (
                      <span className="ml-2 text-xs text-muted-foreground">（{indClub}）</span>
                    ) : null}
                  </LaneRow>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type IndividualItem = { entryId: string; name: string; clubName?: string | null };
type TeamItem = { teamEntryId: string; teamName: string; clubName?: string | null; members: string[] };

function individualLiveRowLabel(name: string, clubName?: string | null) {
  const club = secondaryClubLineForIndividual(clubName);
  return (
    <>
      <span className="font-medium">{name}</span>
      {club ? <span className="ml-2 text-xs text-muted-foreground">（{club}）</span> : null}
    </>
  );
}

function orderIndividualItemsByConfirmedResultRank(
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

function orderTeamItemsByConfirmedResultRank(
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

function snapshotLaneForIndividual(
  apiHeat: HeatMarshalHeatRow | undefined,
  entryId: string,
  fallLane: number
): number {
  const p = apiHeat?.participants.find(
    (x) => x.participantType === "INDIVIDUAL" && x.competitionEntryId === entryId
  );
  return p?.lane ?? fallLane;
}

function snapshotLaneForTeam(
  apiHeat: HeatMarshalHeatRow | undefined,
  teamEntryId: string,
  fallLane: number
): number {
  const p = apiHeat?.participants.find((x) => x.participantType === "TEAM" && x.teamEntryId === teamEntryId);
  return p?.lane ?? fallLane;
}

/** JSON 由来の heatIndex が string でも一致する。マーシャル API と表示用 heat 番号の突合に使う */
function marshalHeatMatchesDisplayIndex(h: HeatMarshalHeatRow, displayHeatNumber: number): boolean {
  return Number(h.heatIndex) === Number(displayHeatNumber);
}

export type LiveRoundContentProps = {
  eventId: string;
  isTeam: boolean;
  individualHeats: IndividualItem[][];
  teamHeats: TeamItem[][];
  /**
   * 各行のスナップショット上の heatIndex。未指定時は行順で 1,2,3…（プレビュー用の仮分割と一致）。
   */
  marshalDisplayHeatIndices?: number[] | null;
  heatAdvanceQuotas?: (number | null)[] | null;
  /** サーバー同期の I:entryId / T:teamId → status（participantStatusRows が無いときのフォールバック） */
  participantStatusByKey?: Readonly<Record<string, string>> | null;
  /** 当日運用の全行（marshalRound 付き）。指定かつ marshalRoundForDisplay があるとタブごとに正しく集計 */
  participantStatusRows?: ReadonlyArray<{
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    status: string;
    marshalRound: ResultRound;
    updatedAt: Date | string;
    calledAt?: Date | string | null;
  }> | null;
  marshalRoundForDisplay?: ResultRound | null;
  /** ステップ1 確定済みなら true（失格管理の表示。ラウンド不一致でもマーシャル操作より優先して出す） */
  heatPlanConfirmedForDsq?: boolean;
  /** 表示中タブのマーシャル（主催管理者・スナップショット連動） */
  startListMarshal?: {
    heats: HeatMarshalHeatRow[] | null;
    loading: boolean;
    /** heat-marshal GET が返した実効ラウンド（PUT / 締切 / リザルト API と一致させる） */
    round: ResultRound;
    competitionId: string;
    marshalOpsBlocked: boolean;
    /**
     * true のとき、タブのラウンドと API が返したラウンドが一致しない（例: 次ラ未スナップショットで API が先頭ラにフォールバック）。
     * プレビュー表示と heats が対応しないため誤った「未登録」を出さず、操作もブロックする。
     */
    marshalRoundMismatch?: boolean;
    isCallClosed: boolean;
    onMarshalSuccess: () => void | Promise<void>;
    /** dialog: 一覧のみ。inline: マーシャル。result: リザルト（チェック・NFCで着順） */
    marshalUiMode?: "dialog" | "inline" | "result";
    /** marshalUiMode が result のときのみ使用 */
    resultCapture?: {
      rows: HeatResultCaptureRow[];
      locked: boolean;
      loading: boolean;
      confirmedHeats: number[];
      onRefetch: () => void | Promise<void>;
    };
  } | null;
};

export function LiveRoundContent({
  eventId,
  isTeam,
  individualHeats,
  teamHeats,
  marshalDisplayHeatIndices,
  heatAdvanceQuotas,
  startListMarshal,
  participantStatusByKey,
  participantStatusRows,
  marshalRoundForDisplay,
  heatPlanConfirmedForDsq = false,
}: LiveRoundContentProps) {
  const snapshotHeatIndexForRow = (rowIdx: number) =>
    marshalDisplayHeatIndices?.[rowIdx] ?? rowIdx + 1;
  const quotaFor = (heatIndex: number) => heatAdvanceQuotas?.[heatIndex];
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
      }));
      return buildParticipantStatusRecordForRound(normalized, marshalRoundForDisplay);
    }
    return participantStatusByKey ?? {};
  }, [participantStatusRows, marshalRoundForDisplay, participantStatusByKey]);
  const statusUpdatedAtByKey = useMemo(() => {
    const out: Record<string, string> = {};
    if (!participantStatusRows?.length || !marshalRoundForDisplay) return out;
    for (const row of participantStatusRows) {
      if (row.marshalRound !== marshalRoundForDisplay) continue;
      const pType = row.participantType === "TEAM" ? "TEAM" : "INDIVIDUAL";
      const teamMemberUserId = (row as { teamMemberUserId?: string | null }).teamMemberUserId;
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
  }, [participantStatusRows, marshalRoundForDisplay]);
  const m = startListMarshal ?? null;
  const mRef = useRef(m);
  mRef.current = m;
  const uiMode = m?.marshalUiMode ?? "dialog";
  const resultMode = uiMode === "result";
  const marshalInline = Boolean(m && uiMode === "inline");
  const showMarshalAdminUi = Boolean(m && !resultMode);
  const marshalRoundMismatch = Boolean(m?.marshalRoundMismatch);
  const showDsqManagementLink = Boolean(m && !m.loading && heatPlanConfirmedForDsq);
  const resultCapture = m?.resultCapture;
  const resultCaptureVisible = Boolean(resultMode && m && resultCapture);

  const [localMarshalHeats, setLocalMarshalHeats] = useState<HeatMarshalHeatRow[]>([]);
  const [localResultRows, setLocalResultRows] = useState<HeatResultCaptureRow[]>([]);
  const [marshalPendingKey, setMarshalPendingKey] = useState<string | null>(null);
  const [marshalDraftOps, setMarshalDraftOps] = useState<
    Record<
      string,
      {
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
      }
    >
  >({});
  const [marshalDraftErrors, setMarshalDraftErrors] = useState<Record<string, string>>({});
  const [marshalBulkSubmitting, setMarshalBulkSubmitting] = useState(false);
  const [resultCapturePendingKey, setResultCapturePendingKey] = useState<string | null>(null);
  const [resultDraftOps, setResultDraftOps] = useState<
    Record<
      string,
      {
        opKey: string;
        heatIndex: number;
        tieWithPrevious: boolean;
        inputOrder: "asc" | "desc";
        participantType: "INDIVIDUAL" | "TEAM";
        competitionEntryId?: string;
        teamEntryId?: string;
        teamMemberUserId?: string;
        draftSequence?: number;
      }
    >
  >({});
  const [resultDraftErrors, setResultDraftErrors] = useState<Record<string, string>>({});
  const [marshalResult, setMarshalResult] = useState<MarshalResultPayload | null>(null);
  const [heatCloseTarget, setHeatCloseTarget] = useState<number | null>(null);
  const [heatCloseBusy, setHeatCloseBusy] = useState(false);
  const [heatReopenTarget, setHeatReopenTarget] = useState<number | null>(null);
  const [heatReopenBusy, setHeatReopenBusy] = useState(false);
  const [heatResultConfirmTarget, setHeatResultConfirmTarget] = useState<number | null>(null);
  const [heatResultConfirmBusy, setHeatResultConfirmBusy] = useState(false);
  const [tieNextHeatIndex, setTieNextHeatIndex] = useState<number | null>(null);
  const [localConfirmedHeats, setLocalConfirmedHeats] = useState<number[]>([]);
  const [nfcMarshalInline, setNfcMarshalInline] = useState<
    "idle" | "listening" | "unsupported" | "error"
  >("idle");
  const [nfcResultInline, setNfcResultInline] = useState<
    "idle" | "listening" | "unsupported" | "error"
  >("idle");
  const [resultInputOrder, setResultInputOrder] = useState<"asc" | "desc">("asc");
  const [dragSourceParticipantKey, setDragSourceParticipantKey] = useState<string | null>(null);
  const [dragOverParticipantKey, setDragOverParticipantKey] = useState<string | null>(null);
  const heatsRef = useRef(localMarshalHeats);
  heatsRef.current = localMarshalHeats;
  const tieNextHeatIndexRef = useRef<number | null>(null);
  tieNextHeatIndexRef.current = tieNextHeatIndex;
  const skipPassiveNfcRef = useRef(false);
  const skipPassiveResultNfcRef = useRef(false);
  const marshalNfcAbortRef = useRef<AbortController | null>(null);
  const marshalNfcInFlightRef = useRef(false);
  const resultNfcAbortRef = useRef<AbortController | null>(null);
  const resultNfcInFlightRef = useRef(false);
  const confirmedHeatsRef = useRef<number[]>([]);
  confirmedHeatsRef.current = localConfirmedHeats;
  const resultDraftOpsRef = useRef(resultDraftOps);
  resultDraftOpsRef.current = resultDraftOps;
  const resultDraftPatchTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastLocalResultDraftTouchRef = useRef(0);
  const resultDraftSequenceRef = useRef(0);

  useEffect(() => {
    setLocalMarshalHeats(applyMarshalDraftOpsToHeats(m?.heats ?? [], marshalDraftOps));
  }, [m?.heats, marshalDraftOps]);

  const marshalHeatByDisplayNumber = useMemo(() => {
    const map = new Map<number, HeatMarshalHeatRow>();
    for (const h of localMarshalHeats) {
      const n = Number(h.heatIndex);
      if (Number.isFinite(n)) map.set(n, h);
    }
    return map;
  }, [localMarshalHeats]);

  useEffect(() => {
    setLocalResultRows(resultCapture?.rows ?? []);
  }, [resultCapture?.rows]);

  useEffect(() => {
    if (!resultCaptureVisible) {
      setTieNextHeatIndex(null);
    }
  }, [resultCaptureVisible]);

  const confirmedHeatsKey = JSON.stringify(resultCapture?.confirmedHeats ?? []);
  useEffect(() => {
    setLocalConfirmedHeats(resultCapture?.confirmedHeats ?? []);
  }, [confirmedHeatsKey, resultCapture?.confirmedHeats]);

  useEffect(() => {
    const timers = resultDraftPatchTimersRef.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
      resultDraftPatchTimersRef.current = {};
    };
  }, []);

  const scheduleResultDraftServerPatch = useCallback(
    (heatIndex: number) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      timers[heatIndex] = setTimeout(() => {
        const mm = mRef.current;
        if (!mm?.competitionId) {
          delete timers[heatIndex];
          return;
        }
        lastLocalResultDraftTouchRef.current = Date.now();
        const entries: Record<string, HeatResultDraftServerEntry> = {};
        for (const op of Object.values(resultDraftOpsRef.current)) {
          if (op.heatIndex === heatIndex) {
            entries[op.opKey] = op as HeatResultDraftServerEntry;
          }
        }
        patchHeatOperationDraftResultPayloadFireAndForget(mm.competitionId, {
          eventId,
          round: mm.round,
          heatIndex,
          entries,
        });
        delete timers[heatIndex];
      }, 480);
    },
    [eventId]
  );

  const pullResultDraftsFromServer = useCallback(() => {
    if (!isDayOpsResultDraftServerSyncEnabled()) return;
    if (Date.now() - lastLocalResultDraftTouchRef.current < 900) return;
    const mm = mRef.current;
    if (!mm?.competitionId || mm.marshalUiMode !== "result" || !mm.resultCapture) return;

    void (async () => {
      for (const h of heatsRef.current) {
        const hi = Number(h.heatIndex);
        if (!Number.isFinite(hi) || !h.callClosedAt) continue;
        if (confirmedHeatsRef.current.includes(hi)) continue;
        try {
          const row = await getHeatOperationDraft(mm.competitionId, {
            eventId,
            round: mm.round,
            heatIndex: hi,
          });
          if (!row.updatedAt) continue;
          const entries = parseServerResultDraftPayload(row.resultDraftPayload);
          if (!entries) continue;

          setResultDraftOps((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
              if (next[k]!.heatIndex === hi) delete next[k];
            }
            for (const [k, v] of Object.entries(entries)) {
              if (v && typeof v === "object" && v.heatIndex === hi) {
                next[k] = v as (typeof prev)[string];
              }
            }
            return next;
          });
        } catch {
          // ignore per-heat errors
        }
      }
    })();
  }, [eventId]);

  useEffect(() => {
    if (!resultCaptureVisible || !isDayOpsResultDraftServerSyncEnabled()) return;
    const t = window.setTimeout(() => {
      pullResultDraftsFromServer();
    }, 600);
    return () => window.clearTimeout(t);
  }, [resultCaptureVisible, pullResultDraftsFromServer]);

  useEffect(() => {
    if (!isDayOpsResultDraftServerSyncEnabled() || !resultCaptureVisible) return;
    const onVis = () => {
      if (document.visibilityState === "visible") pullResultDraftsFromServer();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [resultCaptureVisible, pullResultDraftsFromServer]);

  const handleRankRecorded = useCallback(
    (payload: {
      heatIndex: number;
      lane: number;
      rank: number;
      participantType: "INDIVIDUAL" | "TEAM";
      competitionEntryId: string | null;
      teamEntryId: string | null;
    }) => {
      setLocalResultRows((prev) => [
        ...prev,
        {
          heat: payload.heatIndex,
          lane: payload.lane,
          rank: payload.rank,
          entryType: payload.participantType,
          competitionEntryId: payload.competitionEntryId,
          teamEntryId: payload.teamEntryId,
        },
      ]);
      setTieNextHeatIndex((prev) => (prev === payload.heatIndex ? null : prev));
    },
    []
  );

  const countResultDraftsForHeat = useCallback(
    (heatIndex: number) => Object.values(resultDraftOps).filter((op) => op.heatIndex === heatIndex).length,
    [resultDraftOps]
  );

  const toggleResultDraft = useCallback(
    (payload: {
      opKey: string;
      heatIndex: number;
      participant: HeatMarshalParticipant;
      tieWithPrevious: boolean;
      inputOrder: "asc" | "desc";
      checked: boolean;
    }) => {
      const { opKey, heatIndex, participant, tieWithPrevious, inputOrder, checked } = payload;
      setResultDraftErrors((prev) => {
        if (!prev[opKey]) return prev;
        const next = { ...prev };
        delete next[opKey];
        return next;
      });
      setResultDraftOps((prev) => {
        if (!checked) {
          if (!prev[opKey]) return prev;
          const next = { ...prev };
          delete next[opKey];
          return next;
        }
        return {
          ...prev,
          [opKey]: {
            opKey,
            heatIndex,
            tieWithPrevious,
            inputOrder,
            draftSequence: ++resultDraftSequenceRef.current,
            participantType: participant.participantType,
            ...(participant.participantType === "INDIVIDUAL"
              ? { competitionEntryId: participant.competitionEntryId ?? undefined }
              : {
                  teamEntryId: participant.teamEntryId ?? undefined,
                  teamMemberUserId: participant.teamMemberUserId?.trim() || undefined,
                }),
          },
        };
      });
      lastLocalResultDraftTouchRef.current = Date.now();
      scheduleResultDraftServerPatch(heatIndex);
    },
    [scheduleResultDraftServerPatch]
  );

  const rankedParticipantKeysForHeat = useCallback(
    (heatIndex: number): string[] => {
      return [...localResultRows]
        .filter((row) => row.heat === heatIndex && row.rank != null)
        .map((row) => ({
          key: participantKeyFromResultRow(row),
          rank: row.rank as number,
        }))
        .filter((x): x is { key: string; rank: number } => Boolean(x.key))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.key);
    },
    [localResultRows]
  );

  const applyRankOrderLocally = useCallback((heatIndex: number, order: string[]) => {
    setLocalResultRows((prev) => {
      const rankByKey = new Map(order.map((key, idx) => [key, idx + 1]));
      return prev.map((row) => {
        if (row.heat !== heatIndex || row.rank == null) return row;
        const key = participantKeyFromResultRow(row);
        if (!key) return row;
        const nextRank = rankByKey.get(key);
        if (!nextRank) return row;
        return { ...row, rank: nextRank };
      });
    });
  }, []);

  const reorderResultRanks = useCallback(
    async (heatIndex: number, sourceKey: string, targetKey: string) => {
      if (!m) return;
      const current = rankedParticipantKeysForHeat(heatIndex);
      const from = current.indexOf(sourceKey);
      const to = current.indexOf(targetKey);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      applyRankOrderLocally(heatIndex, next);
      try {
        await postHeatResultReorder(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex,
          order: next,
        });
        void resultCapture?.onRefetch();
        dispatchJlaDayOpsParticipantStatusChanged(m.competitionId, eventId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "順位の並べ替えに失敗しました");
        void resultCapture?.onRefetch();
      }
    },
    [applyRankOrderLocally, eventId, m, rankedParticipantKeysForHeat, resultCapture]
  );

  const patchLaneCalled = useCallback((heatIndex1Based: number, lane: number) => {
    setLocalMarshalHeats((prev) =>
      prev.map((h) =>
        marshalHeatMatchesDisplayIndex(h, heatIndex1Based)
          ? {
              ...h,
              participants: h.participants.map((p) =>
                p.lane === lane ? { ...p, status: "CALLED" } : p
              ),
            }
          : h
      )
    );
  }, []);

  const patchLanePending = useCallback((heatIndex1Based: number, lane: number) => {
    setLocalMarshalHeats((prev) =>
      prev.map((h) =>
        marshalHeatMatchesDisplayIndex(h, heatIndex1Based)
          ? {
              ...h,
              participants: h.participants.map((p) =>
                p.lane === lane ? { ...p, status: "PENDING" } : p
              ),
            }
          : h
      )
    );
  }, []);

  const queueMarshalDraftToggle = useCallback(
    (payload: MarshalDraftTogglePayload) => {
      const { participant, heatIndex, targetStatus, opKey } = payload;
      setMarshalDraftErrors((prev) => {
        if (!prev[opKey]) return prev;
        const next = { ...prev };
        delete next[opKey];
        return next;
      });
      if (targetStatus === "CALLED") {
        patchLaneCalled(heatIndex, participant.lane);
      } else {
        patchLanePending(heatIndex, participant.lane);
      }
      setMarshalDraftOps((prev) => ({
        ...prev,
        [opKey]: {
          opKey,
          eventId,
          round: (m?.round ?? "HEAT") as "HEAT" | "SEMI" | "FINAL",
          heatIndex,
          participantType: participant.participantType,
          ...(participant.participantType === "INDIVIDUAL"
            ? { competitionEntryId: participant.competitionEntryId ?? undefined }
            : {
                teamEntryId: participant.teamEntryId ?? undefined,
                teamMemberUserId: participant.teamMemberUserId ?? null,
              }),
          status: targetStatus,
          lastKnownUpdatedAt: statusUpdatedAtByKey[opKey] ?? null,
        },
      }));
    },
    [eventId, m?.round, patchLaneCalled, patchLanePending, statusUpdatedAtByKey]
  );

  const discardMarshalDrafts = useCallback(() => {
    setMarshalDraftOps({});
    setMarshalDraftErrors({});
    if (m) {
      void m.onMarshalSuccess();
    }
  }, [m]);

  const submitMarshalDrafts = useCallback(async () => {
    if (!m) return;
    const operations = Object.values(marshalDraftOps);
    if (operations.length === 0) return;
    setMarshalBulkSubmitting(true);
    try {
      const result = await postParticipantStatusesBulk(m.competitionId, operations);
      const failedMap: Record<string, string> = {};
      for (const f of result.failed) failedMap[f.opKey] = f.error;
      setMarshalDraftErrors(failedMap);
      setMarshalDraftOps((prev) => {
        if (result.failed.length === 0) return {};
        const next: typeof prev = {};
        for (const f of result.failed) {
          if (prev[f.opKey]) next[f.opKey] = prev[f.opKey];
        }
        return next;
      });
      if (result.success.length > 0) {
        toast.success(`${result.success.length}件を確定しました`);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length}件の確定に失敗しました。行ごとのエラーを確認してください`);
      }
      await m.onMarshalSuccess();
      const heatIndicesAfterBulk = new Set(operations.map((o) => o.heatIndex));
      for (const hi of heatIndicesAfterBulk) {
        deleteHeatOperationDraftFireAndForget(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: hi,
        });
      }
      setMarshalResult(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一括確定に失敗しました");
      await m.onMarshalSuccess();
    } finally {
      setMarshalBulkSubmitting(false);
    }
  }, [m, marshalDraftOps, eventId]);

  const patchHeatCallClosed = useCallback((heatIndex1Based: number) => {
    const iso = new Date().toISOString();
    setLocalMarshalHeats((prev) =>
      prev.map((h) =>
        marshalHeatMatchesDisplayIndex(h, heatIndex1Based) ? { ...h, callClosedAt: iso } : h
      )
    );
  }, []);

  const patchHeatCallReopened = useCallback((heatIndex1Based: number) => {
    setLocalMarshalHeats((prev) =>
      prev.map((h) =>
        marshalHeatMatchesDisplayIndex(h, heatIndex1Based) ? { ...h, callClosedAt: null } : h
      )
    );
  }, []);

  const runHeatMarshalClose = useCallback(
    async (displayHeatNumber: number) => {
      if (!m) return;
      setHeatCloseBusy(true);
      try {
        const draftForHeat = Object.values(marshalDraftOps).filter(
          (op) => op.heatIndex === displayHeatNumber
        );
        if (draftForHeat.length > 0) {
          const bulkResult = await postParticipantStatusesBulk(m.competitionId, draftForHeat);
          const failedMap: Record<string, string> = {};
          for (const f of bulkResult.failed) failedMap[f.opKey] = f.error;
          setMarshalDraftErrors((prev) => ({ ...prev, ...failedMap }));
          if (bulkResult.failed.length > 0) {
            toast.error("未確定チェックの反映に失敗したため、締切を中止しました");
            return;
          }
          const successKeys = new Set(bulkResult.success.map((s) => s.opKey));
          setMarshalDraftOps((prev) => {
            if (successKeys.size === 0) return prev;
            const next = { ...prev };
            for (const key of successKeys) delete next[key];
            return next;
          });
          setMarshalDraftErrors((prev) => {
            if (successKeys.size === 0) return prev;
            const next = { ...prev };
            for (const key of successKeys) delete next[key];
            return next;
          });
        }

        const putRes = await fetch(`/api/competitions/${m.competitionId}/day-ops/heat-marshal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            round: m.round,
            heatIndex: displayHeatNumber,
            isClosed: true,
          }),
        });
        const putData = (await putRes.json().catch(() => ({}))) as { error?: string };
        if (!putRes.ok) {
          throw new Error(putData.error || "ヒート召集締切に失敗しました");
        }

        patchHeatCallClosed(displayHeatNumber);
        setHeatCloseTarget(null);
        await m.onMarshalSuccess();
        deleteHeatOperationDraftFireAndForget(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
        toast.success(
          `ヒート${displayHeatNumber}のマーシャルを締め切りました。未召集のレーンは未出場扱いです（競技中の失格 DSQ とは別）`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "処理に失敗しました");
      } finally {
        setHeatCloseBusy(false);
      }
    },
    [m, marshalDraftOps, eventId, patchHeatCallClosed]
  );

  const runHeatMarshalReopen = useCallback(
    async (displayHeatNumber: number) => {
      if (!m) return;
      setHeatReopenBusy(true);
      try {
        const putRes = await fetch(`/api/competitions/${m.competitionId}/day-ops/heat-marshal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            round: m.round,
            heatIndex: displayHeatNumber,
            isClosed: false,
          }),
        });
        const putData = (await putRes.json().catch(() => ({}))) as { error?: string };
        if (!putRes.ok) {
          throw new Error(putData.error || "マーシャル締切の解除に失敗しました");
        }
        patchHeatCallReopened(displayHeatNumber);
        setHeatReopenTarget(null);
        await m.onMarshalSuccess();
        toast.success(`ヒート ${displayHeatNumber} のマーシャルを受付中に戻しました`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "処理に失敗しました");
      } finally {
        setHeatReopenBusy(false);
      }
    },
    [m, eventId, patchHeatCallReopened]
  );

  const runHeatResultConfirm = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setHeatResultConfirmBusy(true);
      try {
        const draftsForHeat = Object.values(resultDraftOps).filter(
          (op) => op.heatIndex === displayHeatNumber
        );
        if (draftsForHeat.length > 0) {
          const failedMap: Record<string, string> = {};
          let successCount = 0;
          for (const op of draftsForHeat) {
            try {
              const data = await postHeatResultCaptureAppend(m.competitionId, {
                mode: "manual",
                eventId,
                round: m.round,
                heatIndex: op.heatIndex,
                tieWithPrevious: op.tieWithPrevious,
                inputOrder: op.inputOrder,
                participantType: op.participantType,
                competitionEntryId:
                  op.participantType === "INDIVIDUAL" ? op.competitionEntryId : undefined,
                teamEntryId: op.participantType === "TEAM" ? op.teamEntryId : undefined,
                teamMemberUserId:
                  op.participantType === "TEAM" ? op.teamMemberUserId : undefined,
              });
              handleRankRecorded({
                heatIndex: op.heatIndex,
                lane: data.lane,
                rank: data.rank,
                participantType: data.participantType,
                competitionEntryId: data.competitionEntryId,
                teamEntryId: data.teamEntryId,
              });
              successCount += 1;
            } catch (error) {
              failedMap[op.opKey] = error instanceof Error ? error.message : "記録に失敗しました";
            }
          }
          setResultDraftErrors((prev) => ({ ...prev, ...failedMap }));
          const failedKeys = new Set(Object.keys(failedMap));
          setResultDraftOps((prev) => {
            const next: typeof prev = {};
            for (const [k, v] of Object.entries(prev)) {
              if (failedKeys.has(k)) next[k] = v;
            }
            return next;
          });
          if (failedKeys.size > 0) {
            if (successCount > 0) {
              toast.error(
                `未確定チェック ${failedKeys.size}件の反映に失敗したため、リザルト確定を中止しました`
              );
            } else {
              toast.error("未確定チェックの反映に失敗したため、リザルト確定を中止しました");
            }
            return;
          }
        }

        await postHeatResultConfirmHeat(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
        setLocalConfirmedHeats((prev) =>
          prev.includes(displayHeatNumber)
            ? prev
            : [...prev, displayHeatNumber].sort((a, b) => a - b)
        );
        setHeatResultConfirmTarget(null);
        void resultCapture.onRefetch();
        toast.success(`ヒート ${displayHeatNumber} のリザルトを確定しました`);
        dispatchJlaDayOpsParticipantStatusChanged(m.competitionId, eventId);
        deleteHeatOperationDraftFireAndForget(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "確定に失敗しました");
      } finally {
        setHeatResultConfirmBusy(false);
      }
    },
    [m, resultCapture, resultDraftOps, eventId, handleRankRecorded]
  );

  const handleMarshalResult = useCallback(
    (r: MarshalResultPayload) => {
      setMarshalResult(r);
      void m?.onMarshalSuccess();
    },
    [m]
  );

  const stopMarshalNfcInline = useCallback(() => {
    marshalNfcAbortRef.current?.abort();
    marshalNfcAbortRef.current = null;
  }, []);

  const processMarshalNfcTag = useCallback(
    async (serial: string) => {
      const mm = mRef.current;
      if (
        !mm ||
        mm.marshalUiMode !== "inline" ||
        mm.loading ||
        mm.marshalOpsBlocked ||
        mm.marshalRoundMismatch ||
        mm.isCallClosed
      ) {
        return;
      }
      if (marshalNfcInFlightRef.current) return;

      const openHeats = [...heatsRef.current]
        .filter((h) => !h.callClosedAt)
        .sort((a, b) => a.heatIndex - b.heatIndex);
      if (openHeats.length === 0) return;

      marshalNfcInFlightRef.current = true;
      setMarshalPendingKey("nfc-auto");
      let lastMsg = "";
      try {
        for (const h of openHeats) {
          try {
            const data = await postHeatMarshalComplete(mm.competitionId, {
              mode: "nfc",
              eventId,
              round: mm.round,
              heatIndex: h.heatIndex,
              nfcTagId: serial,
            });
            const lane = Number(data.lane);
            if (Number.isFinite(lane)) patchLaneCalled(h.heatIndex, lane);
            handleMarshalResult({
              lane,
              label: String(data.label ?? ""),
              clubName: typeof data.clubName === "string" ? data.clubName : null,
              alreadyMarshalled: Boolean(data.alreadyMarshalled),
            });
            if (data.alreadyMarshalled) {
              toast.info("すでに召集済みです");
            } else {
              toast.success("NFCでマーシャル記録しました");
            }
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastMsg = msg;
            if (
              msg.includes("このヒートの参加者ではありません") ||
              msg.includes("召集締切済みのためマーシャル完了できません")
            ) {
              continue;
            }
            toast.error(msg);
            return;
          }
        }
        if (lastMsg) toast.error(lastMsg);
      } finally {
        marshalNfcInFlightRef.current = false;
        setMarshalPendingKey(null);
      }
    },
    [eventId, handleMarshalResult, patchLaneCalled]
  );

  const stopResultNfcInline = useCallback(() => {
    resultNfcAbortRef.current?.abort();
    resultNfcAbortRef.current = null;
  }, []);

  const processResultNfcTag = useCallback(
    async (serial: string) => {
      const mm = mRef.current;
      const rc = mm?.resultCapture;
      if (
        !mm ||
        mm.marshalUiMode !== "result" ||
        !rc ||
        rc.loading ||
        rc.locked ||
        mm.marshalOpsBlocked ||
        mm.marshalRoundMismatch ||
        mm.loading
      ) {
        return;
      }
      if (resultNfcInFlightRef.current) return;

      const confirmedSet = new Set(confirmedHeatsRef.current);
      const candidateHeats = [...heatsRef.current]
        .filter((h) => !confirmedSet.has(h.heatIndex) && Boolean(h.callClosedAt))
        .sort((a, b) => a.heatIndex - b.heatIndex);
      if (candidateHeats.length === 0) return;

      resultNfcInFlightRef.current = true;
      setResultCapturePendingKey("nfc-result-auto");
      let lastMsg = "";
      try {
        for (const h of candidateHeats) {
          try {
            const tieWithPrevious = tieNextHeatIndexRef.current === h.heatIndex;
            const data = await postHeatResultCaptureAppend(mm.competitionId, {
              mode: "nfc",
              eventId,
              round: mm.round,
              heatIndex: h.heatIndex,
              nfcTagId: serial,
              tieWithPrevious,
              inputOrder: resultInputOrder,
            });
            handleRankRecorded({
              heatIndex: h.heatIndex,
              lane: data.lane,
              rank: data.rank,
              participantType: data.participantType,
              competitionEntryId: data.competitionEntryId,
              teamEntryId: data.teamEntryId,
            });
            toast.success(`NFCで着順 ${data.rank} 位を記録しました（ヒート ${h.heatIndex}）`);
            dispatchJlaDayOpsParticipantStatusChanged(mm.competitionId, eventId);
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastMsg = msg;
            if (
              msg.includes("このヒートの参加者ではありません") ||
              msg.includes("スタートリストに該当ヒートがありません")
            ) {
              continue;
            }
            if (msg.includes("すでに順位が記録")) {
              toast.info(msg);
              return;
            }
            if (msg.includes("このヒートのリザルトは確定済み")) {
              continue;
            }
            if (msg.includes("マーシャル（召集チェック）が完了していない")) {
              continue;
            }
            if (
              msg.includes("公式結果が確定済みのため記録できません") ||
              msg.includes("先にスタートリストで")
            ) {
              toast.error(msg);
              return;
            }
            toast.error(msg);
            return;
          }
        }
        if (lastMsg) toast.error(lastMsg);
      } finally {
        resultNfcInFlightRef.current = false;
        setResultCapturePendingKey(null);
      }
    },
    [eventId, handleRankRecorded, resultInputOrder]
  );

  const startResultNfcInline = useCallback(() => {
    const mm = mRef.current;
    const rc = mm?.resultCapture;
    if (
      !mm ||
      mm.marshalUiMode !== "result" ||
      !rc ||
      rc.loading ||
      rc.locked ||
      mm.marshalOpsBlocked ||
      mm.marshalRoundMismatch ||
      mm.loading
    ) {
      stopResultNfcInline();
      setNfcResultInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      stopResultNfcInline();
      setNfcResultInline("unsupported");
      return;
    }
    stopResultNfcInline();
    const ac = new AbortController();
    resultNfcAbortRef.current = ac;
    setNfcResultInline("idle");
    void (async () => {
      try {
        await startNfcScanSession(
          {
            signal: ac.signal,
            iosSessionType: "tag",
            invalidateAfterFirstRead: false,
            alertMessage: "NFCタグをかざしてリザルト記録",
          },
          (tag) => {
            void processResultNfcTag(tag);
          }
        );
        if (!ac.signal.aborted) {
          setNfcResultInline("listening");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setNfcResultInline("error");
        if (e instanceof Error && e.message.includes("対応していません")) {
          setNfcResultInline("unsupported");
        }
      }
    })();
  }, [processResultNfcTag, stopResultNfcInline]);

  const startMarshalNfcInline = useCallback(() => {
    const mm = mRef.current;
    if (
      !mm ||
      mm.marshalUiMode !== "inline" ||
      mm.loading ||
      mm.marshalOpsBlocked ||
      mm.marshalRoundMismatch ||
      mm.isCallClosed
    ) {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      stopMarshalNfcInline();
      setNfcMarshalInline("unsupported");
      return;
    }
    stopMarshalNfcInline();
    const ac = new AbortController();
    marshalNfcAbortRef.current = ac;
    setNfcMarshalInline("idle");
    void (async () => {
      try {
        await startNfcScanSession(
          {
            signal: ac.signal,
            iosSessionType: "tag",
            invalidateAfterFirstRead: false,
            alertMessage: "NFCタグをかざしてマーシャル記録",
          },
          (tag) => {
            void processMarshalNfcTag(tag);
          }
        );
        if (!ac.signal.aborted) {
          setNfcMarshalInline("listening");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setNfcMarshalInline("error");
        if (e instanceof Error && e.message.includes("対応していません")) {
          setNfcMarshalInline("unsupported");
        }
      }
    })();
  }, [processMarshalNfcTag, stopMarshalNfcInline]);

  useEffect(() => {
    const onArm = () => {
      skipPassiveNfcRef.current = true;
      startMarshalNfcInline();
    };
    window.addEventListener("jla-marshal-nfc-arm", onArm);
    return () => window.removeEventListener("jla-marshal-nfc-arm", onArm);
  }, [startMarshalNfcInline]);

  useEffect(() => {
    if (
      !marshalInline ||
      !m ||
      m.loading ||
      m.marshalOpsBlocked ||
      m.marshalRoundMismatch ||
      m.isCallClosed
    ) {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      setNfcMarshalInline("unsupported");
      return;
    }
    if (skipPassiveNfcRef.current) {
      skipPassiveNfcRef.current = false;
      return;
    }
    startMarshalNfcInline();
    return () => {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
    };
    // startListMarshal オブジェクト参照は毎レンダーで変わりうるため、m の個片だけを依存にする
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marshalInline,
    m?.competitionId,
    m?.round,
    eventId,
    m?.loading,
    m?.marshalOpsBlocked,
    m?.marshalRoundMismatch,
    m?.isCallClosed,
    startMarshalNfcInline,
    stopMarshalNfcInline,
  ]);

  useEffect(() => {
    const onArm = () => {
      skipPassiveResultNfcRef.current = true;
      startResultNfcInline();
    };
    window.addEventListener("jla-result-nfc-arm", onArm);
    return () => window.removeEventListener("jla-result-nfc-arm", onArm);
  }, [startResultNfcInline]);

  useEffect(() => {
    if (
      !resultCaptureVisible ||
      !m ||
      !resultCapture ||
      m.loading ||
      resultCapture.loading ||
      resultCapture.locked ||
      m.marshalOpsBlocked ||
      m.marshalRoundMismatch
    ) {
      stopResultNfcInline();
      setNfcResultInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      setNfcResultInline("unsupported");
      return;
    }
    if (skipPassiveResultNfcRef.current) {
      skipPassiveResultNfcRef.current = false;
      return;
    }
    startResultNfcInline();
    return () => {
      stopResultNfcInline();
      setNfcResultInline("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resultCaptureVisible,
    m?.competitionId,
    m?.round,
    eventId,
    m?.loading,
    m?.marshalOpsBlocked,
    m?.marshalRoundMismatch,
    resultCapture?.locked,
    resultCapture?.loading,
    startResultNfcInline,
    stopResultNfcInline,
  ]);

  const renderMarshalLaneRowWithCheckbox = (
    marshal: NonNullable<typeof m>,
    apiHeatForHeat: HeatMarshalHeatRow | undefined,
    displayHeatNumber: number,
    laneNumber: number,
    laneIndex0: number,
    nameContent: ReactNode,
    rowKey: string,
    serverStatus: string | undefined,
    participantOverride?: HeatMarshalParticipant
  ) => {
    const participant =
      participantOverride ?? marshalParticipantForLane(apiHeatForHeat, laneNumber, laneIndex0);
    const displayStatus = resolveHeatLaneDayOpsDisplayStatus(participant, serverStatus);
    const called = displayStatus === "CALLED";
    const heatMarshalBlocked =
      marshal.marshalOpsBlocked ||
      marshal.marshalRoundMismatch ||
      marshal.isCallClosed ||
      Boolean(apiHeatForHeat?.callClosedAt);
    const allowUnsetCalled = !heatMarshalBlocked;
    const rowTitle =
      called
        ? "召集済み"
        : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
          ? dayOpsParticipantStatusLabelJa(displayStatus)
          : undefined;
    return (
      <li key={rowKey} className="flex items-start gap-1.5" title={rowTitle}>
        {marshal.loading ? (
          <span className="mt-1 size-3.5 shrink-0 animate-pulse rounded bg-muted" aria-hidden />
        ) : (
          <MarshalStartListLaneCheckbox
            participant={participant}
            heatIndex={displayHeatNumber}
            marshalDialogBlocked={heatMarshalBlocked}
            marshalPendingKey={marshalBulkSubmitting ? "bulk-commit" : marshalPendingKey}
            onToggleDraft={queueMarshalDraftToggle}
            draftError={participant ? marshalDraftErrors[marshalParticipantKey(participant)] : undefined}
            allowUnsetCalled={allowUnsetCalled}
          />
        )}
        <span
          className="mt-0.5 shrink-0 w-5 text-right text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400"
          aria-label={`レーン ${laneNumber}`}
        >
          {laneNumber}
        </span>
        <div
          className={cn(
            "min-w-0 flex-1 text-[13px] leading-snug",
            marshalDisplayClass(displayStatus),
            called && "font-semibold"
          )}
        >
          <StartListParticipantRowBody status={displayStatus}>
            {nameContent}
          </StartListParticipantRowBody>
        </div>
      </li>
    );
  };

  const renderResultLaneRowWithCheckbox = (
    marshal: NonNullable<typeof m>,
    rc: NonNullable<typeof resultCapture>,
    apiHeatForHeat: HeatMarshalHeatRow | undefined,
    displayHeatNumber: number,
    laneNumber: number,
    laneIndex0: number,
    nameContent: ReactNode,
    rowKey: string,
    serverStatus: string | undefined,
    participantRankKey: string | null
  ) => {
    const participant = marshalParticipantForLane(apiHeatForHeat, laneNumber, laneIndex0);
    const displayStatus = resolveHeatLaneDayOpsDisplayStatus(participant, serverStatus);
    const serverRk = resultRankForParticipant(displayHeatNumber, participant, localResultRows);
    const provisionalRk = provisionalResultRankForParticipant(
      displayHeatNumber,
      participant,
      apiHeatForHeat,
      localResultRows,
      resultDraftOps,
      resultInputOrder
    );
    const displayRk = serverRk ?? provisionalRk;
    const heatConfirmed = localConfirmedHeats.includes(displayHeatNumber);
    const heatMarshalClosed = Boolean(apiHeatForHeat?.callClosedAt);
    const captureBlocked =
      marshal.marshalOpsBlocked ||
      marshal.marshalRoundMismatch ||
      rc.locked ||
      heatConfirmed ||
      !heatMarshalClosed;
    const st = displayStatus;
    const terminalResult = Boolean(st && isDayOpsTerminalParticipantStatus(st));
    /** 確定前: レーン番号または仮着順。確定後: 着順または L+レーン */
    const leftColumnContent =
      heatConfirmed && serverRk != null ? (
        <span className="text-violet-800 dark:text-violet-200">{serverRk}位</span>
      ) : heatConfirmed ? (
        <span className="text-muted-foreground" title={`スタートレーン ${laneNumber}（着順記録なし）`}>
          L{laneNumber}
        </span>
      ) : displayRk != null ? (
        <span
          className={cn(
            "tabular-nums",
            serverRk != null
              ? "text-violet-800 dark:text-violet-200"
              : "text-violet-700/90 dark:text-violet-300/90"
          )}
          title={
            serverRk != null
              ? undefined
              : "未保存の仮表示です。「リザルト確定」でデータベースに反映されます"
          }
        >
          {displayRk}位
        </span>
      ) : (
        laneNumber
      );
    const showRankBadgeInline = displayRk != null && !heatConfirmed;
    const canDragRank = Boolean(
      participantRankKey &&
        serverRk != null &&
        !heatConfirmed &&
        !marshal.loading &&
        !rc.loading &&
        !captureBlocked
    );
    return (
      <li
        key={rowKey}
        className={cn(
          "flex items-start gap-1.5",
          canDragRank &&
            "cursor-move rounded-sm border border-transparent hover:border-violet-300/70",
          canDragRank &&
            dragOverParticipantKey === participantRankKey &&
            "border-violet-400/90 bg-violet-50/70 dark:border-violet-700/90 dark:bg-violet-950/30"
        )}
        draggable={canDragRank}
        title={canDragRank ? "ドラッグして着順を並べ替え" : undefined}
        onDragStart={() => {
          if (!canDragRank || !participantRankKey) return;
          setDragSourceParticipantKey(participantRankKey);
          setDragOverParticipantKey(participantRankKey);
        }}
        onDragEnd={() => {
          setDragSourceParticipantKey(null);
          setDragOverParticipantKey(null);
        }}
        onDragOver={(e) => {
          if (!canDragRank || !dragSourceParticipantKey || !participantRankKey) return;
          e.preventDefault();
          setDragOverParticipantKey(participantRankKey);
        }}
        onDragLeave={() => {
          if (!canDragRank) return;
          setDragOverParticipantKey(null);
        }}
        onDrop={(e) => {
          if (!canDragRank || !dragSourceParticipantKey || !participantRankKey) return;
          e.preventDefault();
          void reorderResultRanks(displayHeatNumber, dragSourceParticipantKey, participantRankKey);
          setDragSourceParticipantKey(null);
          setDragOverParticipantKey(null);
        }}
      >
        {marshal.loading || rc.loading ? (
          <span className="mt-1 size-3.5 shrink-0 animate-pulse rounded bg-muted" aria-hidden />
        ) : heatConfirmed ? (
          <span
            className="mt-0.5 grid size-3.5 shrink-0 place-items-center self-start text-violet-700 dark:text-violet-300"
            title="リザルト確定済み（変更不可）"
          >
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
            <span className="sr-only">リザルト確定済み</span>
          </span>
        ) : (
          <ResultStartListLaneCheckbox
            participant={participant}
            serverDayOpsStatus={serverStatus}
            heatIndex={displayHeatNumber}
            captureBlocked={captureBlocked}
            capturePendingKey={resultCapturePendingKey}
            resultRows={localResultRows}
            onToggleDraft={toggleResultDraft}
            draftChecked={
              participant
                ? Boolean(resultDraftOps[marshalParticipantKey(participant)])
                : false
            }
            draftError={
              participant
                ? resultDraftErrors[marshalParticipantKey(participant)]
                : undefined
            }
            tieWithPrevious={tieNextHeatIndex === displayHeatNumber}
            inputOrder={resultInputOrder}
          />
        )}
        <span
          className={cn(
            "mt-0.5 shrink-0 min-w-[2.25rem] text-right text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400",
            heatConfirmed && serverRk != null && "text-violet-800 dark:text-violet-200",
            !heatConfirmed && displayRk != null && "text-violet-800 dark:text-violet-200"
          )}
          aria-label={
            heatConfirmed && serverRk != null
              ? `確定着順 ${serverRk}位、スタートレーン ${laneNumber}`
              : heatConfirmed
                ? `スタートレーン ${laneNumber}、着順は記録されていません`
                : displayRk != null
                  ? `仮着順 ${displayRk}位、スタートレーン ${laneNumber}`
                  : `スタートレーン ${laneNumber}`
          }
        >
          {leftColumnContent}
        </span>
        <div
          className={cn(
            "min-w-0 flex-1 text-[13px] leading-snug",
            marshalDisplayClass(displayStatus),
            displayRk != null && !heatConfirmed && "font-semibold text-violet-800 dark:text-violet-200",
            heatConfirmed && serverRk != null && "font-semibold"
          )}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                {nameContent}
                {showRankBadgeInline ? (
                  <span
                    className={cn(
                      "rounded px-1 py-0 text-[10px] font-bold tabular-nums",
                      serverRk != null
                        ? "bg-violet-100 text-violet-950 dark:bg-violet-900/80 dark:text-violet-50"
                        : "border border-dashed border-violet-400/70 bg-violet-50/80 text-violet-900 dark:border-violet-600/70 dark:bg-violet-950/50 dark:text-violet-100"
                    )}
                    title={
                      serverRk == null && provisionalRk != null
                        ? "仮表示（リザルト確定で正式記録）"
                        : undefined
                    }
                  >
                    {displayRk}位{serverRk == null && provisionalRk != null ? "（仮）" : ""}
                  </span>
                ) : null}
              </div>
            </div>
            {terminalResult && st ? (
              <span
                className={cn(
                  "inline-flex shrink-0 self-start rounded border px-1 py-px text-[10px] font-semibold tabular-nums leading-tight",
                  dayOpsTerminalStatusBadgeClass(st)
                )}
              >
                {dayOpsParticipantStatusLabelJa(st)}
              </span>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-1.5">
      {resultCaptureVisible && m && resultCapture ? (
        <>
          <div className="space-y-1.5 rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
            <p>
              <span className="font-semibold">リザルトモード</span>
              {" — "}
              各ヒートでマーシャル締切後にのみ記録できます。召集済みのみ対象で、ヒート単位です。チェックまたは NFC
              で記録し、召集済み全員分そろってから「リザルト確定」してください。記録済みの行はドラッグで並べ替えられます。
            </p>
            <p className="text-muted-foreground dark:text-violet-200/85">
              <span className="font-semibold text-violet-950 dark:text-violet-100">公開</span>
              {" — "}
              Web の一般掲載は主催の「公式結果」で
              <span className="font-medium text-foreground"> 公開日時 </span>
              が設定されたときです（当日の確定だけでは結果一覧に載りません）。
            </p>
            {resultCapture.locked ? (
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                公式結果が確定済みのため記録できません。
              </p>
            ) : null}
            {localConfirmedHeats.length > 0 && !resultCapture.locked ? (
              <p className="border-t border-violet-200/80 pt-1.5 text-muted-foreground dark:border-violet-800/60">
                <span className="font-semibold text-violet-950 dark:text-violet-100">確定済みヒート</span>
                {" — "}
                左は着順、記録がない行は L＋レーン番号です。
              </p>
            ) : null}
          </div>
          {!m.loading && !resultCapture.loading && !m.marshalOpsBlocked && !resultCapture.locked ? (
            <p
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] leading-snug",
                nfcResultInline === "listening" &&
                  "border-violet-200/80 bg-violet-50/90 text-violet-950 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-100",
                nfcResultInline === "unsupported" &&
                  "border-border/80 bg-muted/30 text-muted-foreground",
                nfcResultInline === "error" &&
                  "border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                nfcResultInline === "idle" && "border-transparent bg-transparent text-muted-foreground"
              )}
              role="status"
            >
              {nfcResultInline === "listening"
                ? "NFC 待機中（ヒートを順に試し、タグの選手がいるヒートで次の着順に記録されます）"
                : nfcResultInline === "unsupported"
                  ? "この環境では NFC を利用できません。レーン左のチェックで記録してください。"
                  : nfcResultInline === "error"
                    ? "NFC を開始できませんでした。「リザルト」をもう一度タップするか、チェックで記録してください。"
                    : "NFC を準備しています…"}
            </p>
          ) : null}
          <div className="sticky top-2 z-20 mt-1 rounded-md border border-violet-200/90 bg-violet-50/95 px-2 py-1.5 shadow-sm backdrop-blur-[1px] dark:border-violet-900/70 dark:bg-violet-950/70 sm:static sm:bg-violet-50/70 sm:shadow-none dark:sm:bg-violet-950/35">
            <div
              className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
              role="radiogroup"
              aria-label="着順の入力方向"
            >
              <span className="text-[10px] font-semibold text-violet-900 dark:text-violet-100 sm:mr-1">
                着順の入れ方
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={resultInputOrder === "asc" ? "default" : "outline"}
                  className="h-8 min-w-[7.5rem] px-2.5 text-[10px] font-semibold sm:h-7"
                  role="radio"
                  aria-checked={resultInputOrder === "asc"}
                  onClick={() => setResultInputOrder("asc")}
                  title="1位から空き番を順に埋めます。失格・未記録の行は一覧では末尾に並びます。"
                >
                  上位から<span className="ml-0.5 font-normal opacity-90">（1位〜）</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={resultInputOrder === "desc" ? "default" : "outline"}
                  className="h-8 min-w-[7.5rem] px-2.5 text-[10px] font-semibold sm:h-7"
                  role="radio"
                  aria-checked={resultInputOrder === "desc"}
                  onClick={() => setResultInputOrder("desc")}
                  title="最下位から埋めます。基準人数は当ヒートの召集済人数です（団体は構成員全員が召集済のとき1枠）。失格・未記録は末尾です。"
                >
                  下位から<span className="ml-0.5 font-normal opacity-90">（最下位〜）</span>
                </Button>
              </div>
            </div>
            <p
              className="mt-1 text-left text-[10px] text-muted-foreground sm:text-right"
              title="降順ではマーシャル一覧の召集済人数が上限です。団体は構成員全員が召集済のとき1枠として数えます。"
            >
              失格・未記録は一覧では末尾に並びます。
            </p>
          </div>
        </>
      ) : resultMode && m && !resultCapture ? (
        <p className="rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
          <span className="font-semibold">リザルトモード</span>
          — 状態を読み込めませんでした。ページを更新するか、しばらく待ってから再度お試しください。
        </p>
      ) : null}
      {marshalInline && m ? (
        <div className="space-y-1.5">
          {Object.keys(marshalDraftOps).length > 0 ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px]">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">
                  未確定 {Object.keys(marshalDraftOps).length}件
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    disabled={marshalBulkSubmitting}
                    onClick={discardMarshalDrafts}
                  >
                    取り消し
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={marshalBulkSubmitting}
                    onClick={() => void submitMarshalDrafts()}
                  >
                    {marshalBulkSubmitting ? "確定中…" : "確定"}
                  </Button>
                </div>
              </div>
              {Object.keys(marshalDraftErrors).length > 0 ? (
                <p className="mt-1 text-[10px] text-destructive">
                  {Object.keys(marshalDraftErrors).length}件でエラーがあります。再確認して再度確定してください。
                </p>
              ) : null}
            </div>
          ) : null}
          {!m.loading && !m.marshalOpsBlocked && !m.isCallClosed ? (
            <p
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] leading-snug",
                nfcMarshalInline === "listening" &&
                  "border-orange-200/80 bg-orange-50/90 text-orange-950 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-100",
                nfcMarshalInline === "unsupported" &&
                  "border-border/80 bg-muted/30 text-muted-foreground",
                nfcMarshalInline === "error" &&
                  "border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                nfcMarshalInline === "idle" && "border-transparent bg-transparent text-muted-foreground"
              )}
              role="status"
            >
              {nfcMarshalInline === "listening"
                ? "NFC 待機中（タグをかざすと、該当する未締切ヒートに記録されます）"
                : nfcMarshalInline === "unsupported"
                  ? "この環境では NFC を利用できません。レーン左のチェックで記録してください。"
                  : nfcMarshalInline === "error"
                    ? "NFC を開始できませんでした。「マーシャル」をもう一度タップするか、チェックで記録してください。"
                    : "NFC を準備しています…"}
            </p>
          ) : null}
        </div>
      ) : m && !marshalInline && !resultMode && !m.loading ? (
        <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          通常モードです。レーン単位の失格の申請・取り消しは、直下の
          <span className="font-medium text-foreground"> 失格管理 </span>
          から行えます。マーシャル操作は
          <span className="font-medium text-foreground"> 「マーシャル」モード </span>
          、着順の記録は
          <span className="font-medium text-foreground"> 「リザルト」モード </span>
          に切り替えてください。マーシャルモードでは、各ヒートの
          <span className="font-medium text-foreground"> マーシャル締切まで </span>
          召集チェックの付け外しが可能です（締切の解除は公式リザルト記録前に限ります）。
        </p>
      ) : null}
      {showDsqManagementLink && m ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 dark:border-destructive/30 dark:bg-destructive/10">
          <p className="min-w-0 text-[10px] leading-snug text-muted-foreground">
            レーン単位の失格の申請・取り消しはこちらから行えます。
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 border-destructive/35 px-2.5 text-[10px] text-destructive hover:bg-destructive/10"
            asChild
          >
            <Link
              href={`/competitions/${m.competitionId}/start-list/${eventId}/dsq?round=${encodeURIComponent(
                marshalRoundForDisplay ?? m.round
              )}`}
              prefetch={false}
            >
              失格管理
            </Link>
          </Button>
        </div>
      ) : null}
      {marshalRoundMismatch && m ? (
        <p className="rounded-md border border-amber-200/90 bg-amber-50/80 px-2.5 py-2 text-[10px] leading-snug text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          このタブのラウンドはスタートリストスナップショットにまだ含まれていません（API
          は別ラウンドのヒートを返しています）。次ラの生成後にページを更新すると、マーシャル・リザルトと表示が一致します。
        </p>
      ) : null}
      {!isTeam &&
        individualHeats.map((heatItems, heatIndex) => {
          const displayHeatNumber = snapshotHeatIndexForRow(heatIndex);
          const apiHeat = marshalHeatByDisplayNumber.get(displayHeatNumber);
          const heatCallClosed = Boolean(apiHeat?.callClosedAt);
          const heatCloseDisabled =
            !m ||
            m.loading ||
            !apiHeat ||
            m.marshalOpsBlocked ||
            marshalRoundMismatch ||
            m.isCallClosed ||
            heatCallClosed;
          const heatReopenDisabled =
            !m ||
            m.loading ||
            !apiHeat ||
            m.marshalOpsBlocked ||
            marshalRoundMismatch ||
            Boolean(apiHeat?.marshalReopenBlocked);
          const heatConfirmedForSort = localConfirmedHeats.includes(displayHeatNumber);
          const calledForResultConfirm = countCalledInMarshalHeat(apiHeat);
          const rankOkCount = countOkRanksForHeat(localResultRows, displayHeatNumber, apiHeat);
          const resultDraftCount = countResultDraftsForHeat(displayHeatNumber);
          const canTieInHeat = rankOkCount > 0;
          const heatResultRanksComplete =
            calledForResultConfirm === 0 ||
            rankOkCount + resultDraftCount >= calledForResultConfirm;
          const indForResult = heatConfirmedForSort
            ? orderIndividualItemsByConfirmedResultRank(heatItems, displayHeatNumber, localResultRows)
            : heatItems;
          const heatAdvanceQuota = quotaFor(heatIndex);
          return (
            <div
              key={`${eventId}-heat-${heatIndex}`}
              className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
                  ヒート {displayHeatNumber}（{heatItems.length}件）
                  {typeof heatAdvanceQuota === "number" ? (
                    <HeatAdvanceQuotaLabel
                      quota={heatAdvanceQuota}
                      resultCaptureVisible={resultCaptureVisible}
                      rankOkCount={rankOkCount}
                      calledCount={calledForResultConfirm}
                      hasApiHeat={Boolean(apiHeat)}
                    />
                  ) : null}
                  {(showMarshalAdminUi || resultCaptureVisible) &&
                  !m?.loading &&
                  !apiHeat &&
                  !marshalRoundMismatch ? (
                    <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-300">
                      · スナップショットに未登録（マーシャル・リザルト記録不可）
                    </span>
                  ) : null}
                </p>
                {(resultCaptureVisible && m && resultCapture) || showMarshalAdminUi ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {resultCaptureVisible && m && resultCapture ? (
                      <>
                        {localConfirmedHeats.includes(displayHeatNumber) ? (
                          <span className="rounded bg-violet-200/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                            リザルト確定済み
                          </span>
                        ) : null}
                        {!localConfirmedHeats.includes(displayHeatNumber) && resultDraftCount > 0 ? (
                          <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                            未確定 {resultDraftCount}件
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={
                            m.loading ||
                            resultCapture.loading ||
                            resultCapture.locked ||
                            m.marshalOpsBlocked ||
                            marshalRoundMismatch ||
                            !apiHeat ||
                            !heatCallClosed ||
                            localConfirmedHeats.includes(displayHeatNumber) ||
                            heatResultConfirmBusy ||
                            !heatResultRanksComplete
                          }
                          onClick={() => setHeatResultConfirmTarget(displayHeatNumber)}
                        >
                          リザルト確定
                        </Button>
                        <Button
                          type="button"
                          variant={
                            tieNextHeatIndex === displayHeatNumber ? "default" : "outline"
                          }
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={
                            m.loading ||
                            resultCapture.loading ||
                            resultCapture.locked ||
                            m.marshalOpsBlocked ||
                            marshalRoundMismatch ||
                            !apiHeat ||
                            !heatCallClosed ||
                            localConfirmedHeats.includes(displayHeatNumber) ||
                            !canTieInHeat
                          }
                          onClick={() =>
                            setTieNextHeatIndex((prev) =>
                              prev === displayHeatNumber ? null : displayHeatNumber
                            )
                          }
                        >
                          次を同着
                        </Button>
                      </>
                    ) : null}
                    {showMarshalAdminUi ? (
                      <>
                        {heatCallClosed ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:bg-amber-950/80 dark:text-amber-100">
                            締切済み
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-100">
                            受付中
                          </span>
                        )}
                        {heatCallClosed ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={heatReopenDisabled}
                            title={
                              apiHeat?.marshalReopenBlocked
                                ? "公式リザルトがあるヒートは受付中に戻せません"
                                : undefined
                            }
                            onClick={() => setHeatReopenTarget(displayHeatNumber)}
                          >
                            受付中に戻す
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={heatCloseDisabled}
                            onClick={() => setHeatCloseTarget(displayHeatNumber)}
                          >
                            マーシャル締切
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {(m?.loading || (resultCaptureVisible && resultCapture?.loading)) ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {resultCaptureVisible && resultCapture?.loading && !m?.loading
                    ? "リザルト記録状況を読み込み中…"
                    : "マーシャル状態を読み込み中…"}
                </p>
              ) : null}
              {resultCaptureVisible &&
              m &&
              resultCapture &&
              apiHeat &&
              !heatCallClosed &&
              !localConfirmedHeats.includes(displayHeatNumber) ? (
                <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                  マーシャル締切後にリザルトを記録できます。「マーシャル締切」を実行してください。
                </p>
              ) : null}
              {resultCaptureVisible &&
              m &&
              resultCapture &&
              !heatConfirmedForSort &&
              apiHeat &&
              calledForResultConfirm > 0 &&
              !heatResultRanksComplete ? (
                <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                  召集済み {calledForResultConfirm} 名のうち、着順入力済み {rankOkCount} 件・未確定{" "}
                  {resultDraftCount} 件です。全員分が反映されるまでリザルト確定はできません。
                </p>
              ) : null}
              {resultCaptureVisible && m && resultCapture ? (
                <>
                  <ul className="mt-1 space-y-0.5">
                    {(heatConfirmedForSort
                      ? indForResult.map((item, index) => ({
                          item,
                          originalIndex: heatItems.findIndex((x) => x.entryId === item.entryId),
                          fallbackIndex: index,
                        }))
                      : indForResult
                          .map((item, index) => {
                            const originalIndex = heatItems.findIndex((x) => x.entryId === item.entryId);
                            const fallbackLane = originalIndex >= 0 ? originalIndex + 1 : index + 1;
                            const rankForSort = localResultRows.find(
                              (r) =>
                                r.heat === displayHeatNumber &&
                                r.entryType === "INDIVIDUAL" &&
                                r.competitionEntryId === item.entryId &&
                                r.rank != null
                            )?.rank;
                            return {
                              item,
                              originalIndex,
                              fallbackIndex: index,
                              laneForSort: snapshotLaneForIndividual(apiHeat, item.entryId, fallbackLane),
                              rankForSort: rankForSort ?? null,
                            };
                          })
                          .sort((a, b) => {
                            const ar = a.rankForSort;
                            const br = b.rankForSort;
                            if (ar != null && br != null) {
                              if (ar !== br) {
                                return resultInputOrder === "asc" ? ar - br : br - ar;
                              }
                              return a.laneForSort - b.laneForSort;
                            }
                            if (ar != null || br != null) {
                              return ar != null ? -1 : 1;
                            }
                            return resultInputOrder === "asc"
                              ? a.laneForSort - b.laneForSort
                              : b.laneForSort - a.laneForSort;
                          })).map(({ item, originalIndex, fallbackIndex }) => {
                      const fallLane = originalIndex >= 0 ? originalIndex + 1 : fallbackIndex + 1;
                      const snapLane = snapshotLaneForIndividual(apiHeat, item.entryId, fallLane);
                      const laneIndex0 = originalIndex >= 0 ? originalIndex : fallbackIndex;
                      return renderResultLaneRowWithCheckbox(
                        m,
                        resultCapture,
                        apiHeat,
                        displayHeatNumber,
                        snapLane,
                        laneIndex0,
                        individualLiveRowLabel(item.name, item.clubName),
                        `${eventId}-ind-${heatIndex}-${item.entryId}-${laneIndex0}`,
                        statusByKey?.[`I:${item.entryId}`],
                        `I:${item.entryId}`
                      );
                    })}
                  </ul>
                </>
              ) : marshalInline && m ? (
                <>
                  <ul className="mt-1 space-y-0.5">
                    {heatItems.map((item, index) =>
                      renderMarshalLaneRowWithCheckbox(
                        m,
                        apiHeat,
                        displayHeatNumber,
                        index + 1,
                        index,
                        individualLiveRowLabel(item.name, item.clubName),
                        `${eventId}-ind-${heatIndex}-${item.entryId}`,
                        statusByKey?.[`I:${item.entryId}`]
                      )
                    )}
                  </ul>
                </>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {heatItems.map((item, index) => {
                    const lane = index + 1;
                    const mp =
                      m && !m.loading && apiHeat
                        ? marshalParticipantForLane(apiHeat, lane, index)
                        : undefined;
                    const serverSt = statusByKey?.[`I:${item.entryId}`];
                    const displayStatus = resolveHeatLaneDayOpsDisplayStatus(mp, serverSt);
                    const mClass = marshalDisplayClass(displayStatus);
                    const called = displayStatus === "CALLED";
                    const laneTitle =
                      called
                        ? "召集済み"
                        : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
                          ? dayOpsParticipantStatusLabelJa(displayStatus)
                          : undefined;
                    return (
                      <LaneRow
                        key={`${eventId}-ind-${heatIndex}-${item.entryId}`}
                        laneNumber={lane}
                        contentClassName={cn(mClass, called && "font-semibold")}
                        contentTitle={laneTitle}
                      >
                        <StartListParticipantRowBody status={displayStatus}>
                          {individualLiveRowLabel(item.name, item.clubName)}
                        </StartListParticipantRowBody>
                      </LaneRow>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      {isTeam &&
        teamHeats.map((heatItems, heatIndex) => {
          const displayHeatNumber = snapshotHeatIndexForRow(heatIndex);
          const apiHeat = marshalHeatByDisplayNumber.get(displayHeatNumber);
          const heatCallClosed = Boolean(apiHeat?.callClosedAt);
          const heatCloseDisabled =
            !m ||
            m.loading ||
            !apiHeat ||
            m.marshalOpsBlocked ||
            marshalRoundMismatch ||
            m.isCallClosed ||
            heatCallClosed;
          const heatReopenDisabled =
            !m ||
            m.loading ||
            !apiHeat ||
            m.marshalOpsBlocked ||
            marshalRoundMismatch ||
            Boolean(apiHeat?.marshalReopenBlocked);
          const heatConfirmedForSortTeam = localConfirmedHeats.includes(displayHeatNumber);
          const calledForResultConfirmTeam = countCalledInMarshalHeat(apiHeat);
          const rankOkCountTeam = countOkRanksForHeat(localResultRows, displayHeatNumber, apiHeat);
          const resultDraftCountTeam = countResultDraftsForHeat(displayHeatNumber);
          const canTieInHeatTeam = rankOkCountTeam > 0;
          const heatResultRanksCompleteTeam =
            calledForResultConfirmTeam === 0 ||
            rankOkCountTeam + resultDraftCountTeam >= calledForResultConfirmTeam;
          const teamForResult = heatConfirmedForSortTeam
            ? orderTeamItemsByConfirmedResultRank(heatItems, displayHeatNumber, localResultRows)
            : heatItems;
          const heatAdvanceQuotaTeam = quotaFor(heatIndex);
          return (
            <div
              key={`${eventId}-heat-${heatIndex}`}
              className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
                  ヒート {displayHeatNumber}（{heatItems.length}件）
                  {typeof heatAdvanceQuotaTeam === "number" ? (
                    <HeatAdvanceQuotaLabel
                      quota={heatAdvanceQuotaTeam}
                      resultCaptureVisible={resultCaptureVisible}
                      rankOkCount={rankOkCountTeam}
                      calledCount={calledForResultConfirmTeam}
                      hasApiHeat={Boolean(apiHeat)}
                    />
                  ) : null}
                  {(showMarshalAdminUi || resultCaptureVisible) &&
                  !m?.loading &&
                  !apiHeat &&
                  !marshalRoundMismatch ? (
                    <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-300">
                      · スナップショットに未登録（マーシャル・リザルト記録不可）
                    </span>
                  ) : null}
                </p>
                {(resultCaptureVisible && m && resultCapture) || showMarshalAdminUi ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {resultCaptureVisible && m && resultCapture ? (
                      <>
                        {localConfirmedHeats.includes(displayHeatNumber) ? (
                          <span className="rounded bg-violet-200/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                            リザルト確定済み
                          </span>
                        ) : null}
                        {!localConfirmedHeats.includes(displayHeatNumber) &&
                        resultDraftCountTeam > 0 ? (
                          <span className="rounded bg-violet-100/90 px-1.5 py-0.5 text-[10px] font-medium text-violet-950 dark:bg-violet-900/70 dark:text-violet-100">
                            未確定 {resultDraftCountTeam}件
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={
                            m.loading ||
                            resultCapture.loading ||
                            resultCapture.locked ||
                            m.marshalOpsBlocked ||
                            marshalRoundMismatch ||
                            !apiHeat ||
                            !heatCallClosed ||
                            localConfirmedHeats.includes(displayHeatNumber) ||
                            heatResultConfirmBusy ||
                            !heatResultRanksCompleteTeam
                          }
                          onClick={() => setHeatResultConfirmTarget(displayHeatNumber)}
                        >
                          リザルト確定
                        </Button>
                        <Button
                          type="button"
                          variant={
                            tieNextHeatIndex === displayHeatNumber ? "default" : "outline"
                          }
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={
                            m.loading ||
                            resultCapture.loading ||
                            resultCapture.locked ||
                            m.marshalOpsBlocked ||
                            marshalRoundMismatch ||
                            !apiHeat ||
                            !heatCallClosed ||
                            localConfirmedHeats.includes(displayHeatNumber) ||
                            !canTieInHeatTeam
                          }
                          onClick={() =>
                            setTieNextHeatIndex((prev) =>
                              prev === displayHeatNumber ? null : displayHeatNumber
                            )
                          }
                        >
                          次を同着
                        </Button>
                      </>
                    ) : null}
                    {showMarshalAdminUi ? (
                      <>
                        {heatCallClosed ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:bg-amber-950/80 dark:text-amber-100">
                            締切済み
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-100">
                            受付中
                          </span>
                        )}
                        {heatCallClosed ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={heatReopenDisabled}
                            title={
                              apiHeat?.marshalReopenBlocked
                                ? "公式リザルトがあるヒートは受付中に戻せません"
                                : undefined
                            }
                            onClick={() => setHeatReopenTarget(displayHeatNumber)}
                          >
                            受付中に戻す
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={heatCloseDisabled}
                            onClick={() => setHeatCloseTarget(displayHeatNumber)}
                          >
                            マーシャル締切
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {(m?.loading || (resultCaptureVisible && resultCapture?.loading)) ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {resultCaptureVisible && resultCapture?.loading && !m?.loading
                    ? "リザルト記録状況を読み込み中…"
                    : "マーシャル状態を読み込み中…"}
                </p>
              ) : null}
              {resultCaptureVisible &&
              m &&
              resultCapture &&
              apiHeat &&
              !heatCallClosed &&
              !localConfirmedHeats.includes(displayHeatNumber) ? (
                <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                  マーシャル締切後にリザルトを記録できます。「マーシャル締切」を実行してください。
                </p>
              ) : null}
              {resultCaptureVisible &&
              m &&
              resultCapture &&
              !heatConfirmedForSortTeam &&
              apiHeat &&
              calledForResultConfirmTeam > 0 &&
              !heatResultRanksCompleteTeam ? (
                <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                  召集済み {calledForResultConfirmTeam} 名のうち、着順入力済み {rankOkCountTeam}{" "}
                  件・未確定 {resultDraftCountTeam} 件です。全員分が反映されるまでリザルト確定はできません。
                </p>
              ) : null}
              {resultCaptureVisible && m && resultCapture ? (
                <>
                  <ul className="mt-1 space-y-0.5">
                    {(heatConfirmedForSortTeam
                      ? teamForResult.map((team, index) => ({
                          team,
                          originalIndex: heatItems.findIndex((x) => x.teamEntryId === team.teamEntryId),
                          fallbackIndex: index,
                        }))
                      : teamForResult
                          .map((team, index) => {
                            const originalIndex = heatItems.findIndex((x) => x.teamEntryId === team.teamEntryId);
                            const fallbackLane = originalIndex >= 0 ? originalIndex + 1 : index + 1;
                            const rankForSort = localResultRows.find(
                              (r) =>
                                r.heat === displayHeatNumber &&
                                r.entryType === "TEAM" &&
                                r.teamEntryId === team.teamEntryId &&
                                r.rank != null
                            )?.rank;
                            return {
                              team,
                              originalIndex,
                              fallbackIndex: index,
                              laneForSort: snapshotLaneForTeam(apiHeat, team.teamEntryId, fallbackLane),
                              rankForSort: rankForSort ?? null,
                            };
                          })
                          .sort((a, b) => {
                            const ar = a.rankForSort;
                            const br = b.rankForSort;
                            if (ar != null && br != null) {
                              if (ar !== br) {
                                return resultInputOrder === "asc" ? ar - br : br - ar;
                              }
                              return a.laneForSort - b.laneForSort;
                            }
                            if (ar != null || br != null) {
                              return ar != null ? -1 : 1;
                            }
                            return resultInputOrder === "asc"
                              ? a.laneForSort - b.laneForSort
                              : b.laneForSort - a.laneForSort;
                          })).map(({ team, originalIndex, fallbackIndex }) => {
                      const fallLane = originalIndex >= 0 ? originalIndex + 1 : fallbackIndex + 1;
                      const snapLane = snapshotLaneForTeam(apiHeat, team.teamEntryId, fallLane);
                      const laneIndex0 = originalIndex >= 0 ? originalIndex : fallbackIndex;
                      const clubSecondary = secondaryClubLabelForTeamRow(
                        team.teamName,
                        team.clubName
                      );
                      return renderResultLaneRowWithCheckbox(
                        m,
                        resultCapture,
                        apiHeat,
                        displayHeatNumber,
                        snapLane,
                        laneIndex0,
                        <>
                          <p className="font-medium">
                            {team.teamName}
                            {clubSecondary ? (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ({clubSecondary})
                              </span>
                            ) : null}
                          </p>
                          {team.members.length > 0 && (
                            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {team.members.join(" / ")}
                            </div>
                          )}
                        </>,
                        `${eventId}-team-${heatIndex}-${team.teamEntryId}-${laneIndex0}`,
                        foldTeamServerStatusFromMemberKeys(team.teamEntryId, statusByKey),
                        `T:${team.teamEntryId}`
                      );
                    })}
                  </ul>
                </>
              ) : marshalInline && m ? (
                <>
                  <ul className="mt-1 space-y-0.5">
                    {heatItems.flatMap((team, index) => {
                      const lane = index + 1;
                      const clubSecondary = secondaryClubLabelForTeamRow(
                        team.teamName,
                        team.clubName
                      );
                      const memberParts =
                        apiHeat?.participants?.filter(
                          (p) =>
                            p.participantType === "TEAM" &&
                            p.teamEntryId === team.teamEntryId &&
                            p.lane === lane
                        ) ?? [];
                      const rows =
                        memberParts.length > 0
                          ? memberParts
                          : [undefined as HeatMarshalParticipant | undefined];
                      return rows.map((participant, subIdx) => {
                        const serverSt =
                          participant != null
                            ? statusByKey?.[marshalParticipantKey(participant)]
                            : foldTeamServerStatusFromMemberKeys(team.teamEntryId, statusByKey);
                        const nameContent =
                          participant != null ? (
                            <p className="font-medium">{participant.label}</p>
                          ) : (
                            <>
                              <p className="font-medium">
                                {team.teamName}
                                {clubSecondary ? (
                                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                    ({clubSecondary})
                                  </span>
                                ) : null}
                              </p>
                              {team.members.length > 0 && (
                                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  {team.members.join(" / ")}
                                </div>
                              )}
                            </>
                          );
                        return renderMarshalLaneRowWithCheckbox(
                          m,
                          apiHeat,
                          displayHeatNumber,
                          lane,
                          index,
                          nameContent,
                          `${eventId}-team-${heatIndex}-${team.teamEntryId}-${subIdx}`,
                          serverSt,
                          participant ?? undefined
                        );
                      });
                    })}
                  </ul>
                </>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {heatItems.map((team, index) => {
                    const lane = index + 1;
                    const clubSecondary = secondaryClubLabelForTeamRow(
                      team.teamName,
                      team.clubName
                    );
                    const mp =
                      m && !m.loading && apiHeat
                        ? marshalParticipantForLane(apiHeat, lane, index)
                        : undefined;
                    const serverSt = foldTeamServerStatusFromMemberKeys(
                      team.teamEntryId,
                      statusByKey
                    );
                    const displayStatus = resolveHeatLaneDayOpsDisplayStatus(mp, serverSt);
                    const mClass = marshalDisplayClass(displayStatus);
                    const called = displayStatus === "CALLED";
                    const laneTitleTeam =
                      called
                        ? "召集済み"
                        : displayStatus && isDayOpsTerminalParticipantStatus(displayStatus)
                          ? dayOpsParticipantStatusLabelJa(displayStatus)
                          : undefined;
                    return (
                      <LaneRow
                        key={`${eventId}-team-${heatIndex}-${team.teamEntryId}`}
                        laneNumber={lane}
                        contentClassName={cn(mClass, called && "font-semibold")}
                        contentTitle={laneTitleTeam}
                      >
                        <StartListParticipantRowBody status={displayStatus}>
                          <>
                            <p className="font-medium">
                              {team.teamName}
                              {clubSecondary ? (
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                  ({clubSecondary})
                                </span>
                              ) : null}
                            </p>
                            {team.members.length > 0 && (
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {team.members.join(" / ")}
                              </div>
                            )}
                          </>
                        </StartListParticipantRowBody>
                      </LaneRow>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      {(isTeam ? teamHeats : individualHeats).length === 0 ? (
        <p className="text-xs text-gray-500">エントリーなし</p>
      ) : null}

      <AlertDialog
        open={heatCloseTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatCloseBusy) setHeatCloseTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ヒート {heatCloseTarget ?? "—"} のマーシャル締切
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートの召集を締め切り、
                  <span className="font-semibold"> 未召集の参加者を未出場扱い </span>
                  にします（表示は「未出場（マーシャル未完了）」。競技中の失格 DSQ
                  とは別で、リザルトの対象外です）。
                  締切後にリザルトモードで着順の記録が可能になります。
                </p>
                <p className="text-muted-foreground">
                  競技中の失格の訂正は「失格管理」画面から行ってください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatCloseBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={heatCloseBusy || heatCloseTarget === null}
              onClick={() =>
                heatCloseTarget !== null ? void runHeatMarshalClose(heatCloseTarget) : undefined
              }
            >
              {heatCloseBusy ? "処理中…" : "実行する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={heatReopenTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatReopenBusy) setHeatReopenTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ヒート {heatReopenTarget ?? "—"} を受付中に戻す
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートのマーシャル締切を解除し、
                  <span className="font-semibold"> 召集の受付を再開 </span>
                  します。公式リザルトが入っているヒートはサーバー側で拒否されます。
                </p>
                <p className="text-muted-foreground">
                  種目全体のマーシャル締切が有効な場合は、全体の解除が必要になることがあります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatReopenBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              disabled={heatReopenBusy || heatReopenTarget === null}
              onClick={() =>
                heatReopenTarget !== null ? void runHeatMarshalReopen(heatReopenTarget) : undefined
              }
            >
              {heatReopenBusy ? "処理中…" : "受付中に戻す"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={heatResultConfirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatResultConfirmBusy) setHeatResultConfirmTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ヒート {heatResultConfirmTarget ?? "—"} のリザルト確定
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートの着順記録を
                  <span className="font-semibold"> 確定 </span>
                  します。確定後はこのヒートへの追記（チェック・NFC）はできません。
                  召集済みの参加者には、全員分の着順が入っていることが前提です。
                </p>
                <p className="text-muted-foreground">
                  種目全体の公式結果ロックとは別です。誤りがある場合は管理者向けの修正フローを利用してください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatResultConfirmBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              disabled={heatResultConfirmBusy || heatResultConfirmTarget === null}
              onClick={() =>
                heatResultConfirmTarget !== null
                  ? void runHeatResultConfirm(heatResultConfirmTarget)
                  : undefined
              }
            >
              {heatResultConfirmBusy ? "処理中…" : "確定する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={marshalResult !== null}
        onOpenChange={(open) => {
          if (!open) setMarshalResult(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>マーシャル完了</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                {marshalResult ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">レーン</span> {marshalResult.lane}
                    </p>
                    <p className="text-base font-semibold">{marshalResult.label}</p>
                    <p>
                      <span className="text-muted-foreground">所属</span>{" "}
                      {marshalResult.clubName?.trim() ? marshalResult.clubName : "—"}
                    </p>
                    {marshalResult.alreadyMarshalled ? (
                      <p className="text-amber-700 dark:text-amber-300">すでに召集済みでした。</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { sexLabel };
