"use client";

import type { ResultRound } from "@prisma/client";

const RESULT_ROUNDS = ["HEAT", "SEMI", "FINAL"] as const;

function parseHeatMarshalResponseRound(raw: unknown): ResultRound | null {
  if (typeof raw !== "string") return null;
  return (RESULT_ROUNDS as readonly string[]).includes(raw) ? (raw as ResultRound) : null;
}

/** 当日運用シェル: 通常モードの参加者ステータスポーリング */
const DAY_OPS_POLL_INTERVAL_NORMAL_MS = 20_000;
/** マーシャル／リザルト時は複数端末で状態を揃えるため短めにヒート一覧・リザルトを再取得 */
const DAY_OPS_POLL_INTERVAL_SYNC_MS = 4_500;
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleHelp,
  ClipboardList,
  LayoutList,
  ListChecks,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  computeLiveFirstRoundAdvanceQuotas,
  formatStartListTabLabelWithHeatCount,
  getLiveHeatsByTab,
  snapshotRoundForTab,
  type StartListIndividualInput,
  type StartListTeamInput,
} from "@/lib/startListEventTabDisplay";
import type { StartListRoundData } from "@/lib/startListRounds";
import {
  buildRoundTabsForRoundCount,
  coerceRoundTabsToHeatOnly,
  defaultStartListRoundTabLabels,
  normalizeRoundTabs,
  parseStartListSettings,
  type HeatSetting,
  type StartListRoundTab,
} from "@/lib/startListSettings";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { LiveRoundContent, sexLabel } from "@/components/StartListRoundListPanels";
import { getHeatResultCapture, type HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { cn } from "@/lib/utils";
import {
  dispatchJlaDayOpsParticipantStatusChanged,
  JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { measureDayOpsAsync } from "@/lib/dayOpsMetrics";

/** スタートリスト表示モード（タブごと・localStorage） */
export type StartListMarshalViewMode = "normal" | "marshal" | "result";

type EventRow = {
  id: string;
  name: string;
  sex: string;
  type: "INDIVIDUAL" | "TEAM";
  ageCategoryName?: string | null;
};

type Props = {
  competitionId: string;
  competitionName: string;
  /** DB 上のスタートリストスナップショットの記録日時（締切後の自動作成など。表示は常にライブ） */
  archiveRecordedAtIso: string | null;
  event: EventRow;
  initialSettings: unknown;
  defaultMaxLanesPerRace?: number | null;
  configuredStartListRoundCount?: number | null;
  entryCount: number;
  scheduleLabel?: string | null;
  individuals: StartListIndividualInput[];
  teams: StartListTeamInput[];
  /** 公式着（タブに応じて直前ラウンドを参照） */
  officialRanksByRound?: Partial<Record<ResultRound, Record<string, number>>> | null;
  placementSeed: number;
  frozenSnapshotRounds?: StartListRoundData[] | null;
  startListRoundCount?: number | null;
  preliminaryHeatLaneCount?: number | null;
  /** ヒート計画確定日時（ISO）。未確定の間は当日マーシャル不可 */
  heatPlanConfirmedAtIso?: string | null;
  /** マーシャル開始日時（ISO）。設定後はヒート分割変更不可 */
  marshalStartedAtIso?: string | null;
  /**
   * 後方互換: showMarshalOps / showResultOps が未指定のとき、両方をまとめて有効にする。
   * @deprecated showMarshalOps と showResultOps を明示してください。
   */
  showMarshalHeatLinks?: boolean;
  /** 召集（マーシャル）操作。主催管理者向け */
  showMarshalOps?: boolean;
  /** リザルト入力・NFC・ヒート確定。主催管理者またはレコーダー */
  showResultOps?: boolean;
  /** false のときヒート・レーン設定を編集不可（レコーダー等） */
  canEditHeatConfiguration?: boolean;
  /** 種目の当日運用ステータス（ヒート表に終了系バッジ。マーシャル API なしでも表示） */
  participantStatusByKey?: Record<string, string>;
  /** marshalRound 別の当日運用行（SSR）。ポーリングで上書き */
  initialParticipantStatusRows?: ReadonlyArray<{
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    status: string;
    marshalRound: ResultRound;
    updatedAt: string | Date;
    calledAt?: string | Date | null;
  }>;
  /**
   * URL の `?roundIndex=`（0 始まり）で開いたとき、該当するラウンドのタブを最初から選ぶ。
   * スタートリスト内のラウンドタブ UI 自体は変えない。
   */
  initialRoundIndex?: number | null;
};

function pickSetting(
  saved: Record<string, HeatSetting>,
  eventId: string
): HeatSetting {
  if (saved[eventId]) return saved[eventId];
  return { mode: "count", heatCount: "1", heatSize: "" };
}

function deriveRoundTabsForEditor(
  eventSettings: Record<string, HeatSetting>,
  eventId: string,
  configuredStartListRoundCount: number | null | undefined,
  entryCount: number
): StartListRoundTab[] {
  const picked = pickSetting(eventSettings, eventId);
  let tabs = normalizeRoundTabs(picked);
  const rc =
    typeof configuredStartListRoundCount === "number" &&
    Number.isInteger(configuredStartListRoundCount) &&
    configuredStartListRoundCount >= 1 &&
    configuredStartListRoundCount <= 32
      ? configuredStartListRoundCount
      : null;
  if (rc !== null && tabs.length !== rc) {
    tabs = buildRoundTabsForRoundCount(rc, tabs);
  }
  return coerceRoundTabsToHeatOnly(tabs, entryCount);
}

export default function StartListEventUnifiedCard({
  competitionId,
  competitionName,
  archiveRecordedAtIso,
  event,
  initialSettings,
  defaultMaxLanesPerRace = null,
  configuredStartListRoundCount = null,
  entryCount,
  scheduleLabel,
  individuals,
  teams,
  officialRanksByRound = null,
  placementSeed,
  frozenSnapshotRounds = null,
  preliminaryHeatLaneCount = null,
  heatPlanConfirmedAtIso = null,
  marshalStartedAtIso = null,
  showMarshalHeatLinks = false,
  showMarshalOps: showMarshalOpsProp,
  showResultOps: showResultOpsProp,
  canEditHeatConfiguration = true,
  participantStatusByKey,
  initialParticipantStatusRows,
  initialRoundIndex = null,
}: Props) {
  const showMarshalOps = showMarshalOpsProp ?? showMarshalHeatLinks;
  const showResultOps = showResultOpsProp ?? showMarshalHeatLinks;
  const showDayOpsShell = showMarshalOps || showResultOps;

  const router = useRouter();
  const parsed = useMemo(() => parseStartListSettings(initialSettings), [initialSettings]);
  const tabs = useMemo(
    () =>
      deriveRoundTabsForEditor(
        parsed.eventSettings,
        event.id,
        configuredStartListRoundCount,
        entryCount
      ),
    [
      parsed.eventSettings,
      event.id,
      configuredStartListRoundCount,
      entryCount,
    ]
  );
  /** ユーザーが選んだタブ。無効なら先頭タブを表示 */
  const [activeTabUserPick, setActiveTabUserPick] = useState<string | null>(null);
  const selectedTabId = useMemo(() => {
    const first = tabs[0]?.id ?? "";
    if (!first) return "";
    if (activeTabUserPick && tabs.some((t) => t.id === activeTabUserPick)) {
      return activeTabUserPick;
    }
    if (
      typeof initialRoundIndex === "number" &&
      Number.isInteger(initialRoundIndex) &&
      initialRoundIndex >= 0 &&
      initialRoundIndex < tabs.length
    ) {
      const deep = tabs[initialRoundIndex]?.id;
      if (deep) return deep;
    }
    return first;
  }, [tabs, activeTabUserPick, initialRoundIndex]);

  const [listMarshalHeats, setListMarshalHeats] = useState<HeatMarshalHeatRow[] | null>(null);
  /** GET /heat-marshal が返した実効ラウンド（クエリ補正後）。未取得時は null */
  const [listMarshalApiRound, setListMarshalApiRound] = useState<ResultRound | null>(null);
  const [listMarshalLoading, setListMarshalLoading] = useState(false);
  const [listResultRows, setListResultRows] = useState<HeatResultCaptureRow[]>([]);
  const [listResultLocked, setListResultLocked] = useState(false);
  const [listResultLoading, setListResultLoading] = useState(false);
  const [listResultConfirmedHeats, setListResultConfirmedHeats] = useState<number[]>([]);
  /** 当日運用時は API ポーリングで SSR より新しい失格などを反映（ラウンド別行） */
  const [polledParticipantStatusRows, setPolledParticipantStatusRows] = useState<
    NonNullable<Props["initialParticipantStatusRows"]>
  >(() => initialParticipantStatusRows ?? []);
  /** ラウンド（タブ）ごとの表示モード */
  const [marshalViewModeByTab, setMarshalViewModeByTab] = useState<
    Record<string, StartListMarshalViewMode>
  >({});

  const refreshDayOpsParticipantPoll = useCallback(async () => {
    if (!showDayOpsShell) return;
    await measureDayOpsAsync("day-ops participant-statuses", async () => {
      const res = await fetch(
        `/api/competitions/${competitionId}/day-ops/participant-statuses?eventId=${encodeURIComponent(event.id)}&includeCandidates=0`
      );
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        callClosed?: unknown;
        statuses?: ReadonlyArray<{
          participantType: string;
          competitionEntryId: string | null;
          teamEntryId: string | null;
          status: string;
        }>;
      };
      if (Array.isArray(data.statuses)) {
        setPolledParticipantStatusRows(
          data.statuses.map((s) => ({
            participantType: String(s.participantType),
            competitionEntryId: s.competitionEntryId ?? null,
            teamEntryId: s.teamEntryId ?? null,
            status: String(s.status),
            marshalRound: (s as { marshalRound?: ResultRound }).marshalRound ?? "HEAT",
            updatedAt: (s as { updatedAt?: string }).updatedAt ?? new Date().toISOString(),
            calledAt: (s as { calledAt?: string | null }).calledAt ?? null,
          }))
        );
      }
    });
  }, [showDayOpsShell, competitionId, event.id]);

  /* SSR の参加者行をクライアント state に載せ、当日運用ポーリングで上書きする。localStorage から表示モードを復元する。 */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPolledParticipantStatusRows(initialParticipantStatusRows ?? []);
  }, [initialParticipantStatusRows]);

  useEffect(() => {
    if (!showDayOpsShell) return;
    void refreshDayOpsParticipantPoll();
  }, [showDayOpsShell, event.id, refreshDayOpsParticipantPoll]);

  useEffect(() => {
    if (!showDayOpsShell) {
      setPolledParticipantStatusRows(initialParticipantStatusRows ?? []);
    }
  }, [showDayOpsShell, initialParticipantStatusRows]);

  const marshalViewStorageKeyV2 = `jla:startList:marshalView:v2:${competitionId}:${event.id}`;
  const marshalInlineStorageKeyV1 = `jla:startList:marshalInline:v1:${competitionId}:${event.id}`;

  useEffect(() => {
    const coerceMode = (v: unknown): StartListMarshalViewMode | null =>
      v === "normal" || v === "marshal" || v === "result" ? v : null;
    try {
      const raw2 = localStorage.getItem(marshalViewStorageKeyV2);
      if (raw2) {
        const parsed = JSON.parse(raw2) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const next: Record<string, StartListMarshalViewMode> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            const m = coerceMode(v);
            if (m) next[k] = m;
          }
          if (Object.keys(next).length > 0) {
            setMarshalViewModeByTab(next);
            return;
          }
        }
      }
      const raw1 = localStorage.getItem(marshalInlineStorageKeyV1);
      if (!raw1) return;
      const parsed = JSON.parse(raw1) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const migrated: Record<string, StartListMarshalViewMode> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        migrated[k] = v === true ? "marshal" : "normal";
      }
      setMarshalViewModeByTab(migrated);
      try {
        localStorage.setItem(marshalViewStorageKeyV2, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [marshalViewStorageKeyV2, marshalInlineStorageKeyV1]);

  const persistMarshalViewMode = useCallback(
    (tabId: string, mode: StartListMarshalViewMode) => {
      setMarshalViewModeByTab((prev) => {
        const next = { ...prev, [tabId]: mode };
        try {
          localStorage.setItem(marshalViewStorageKeyV2, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [marshalViewStorageKeyV2]
  );

  /** レコーダー等（マーシャル不可）では「マーシャル」モードを保持しない */
  useEffect(() => {
    if (showMarshalOps || !showResultOps) return;
    setMarshalViewModeByTab((prev) => {
      let changed = false;
      const next: Record<string, StartListMarshalViewMode> = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === "marshal") {
          next[k] = "normal";
          changed = true;
        }
      }
      if (changed) {
        try {
          localStorage.setItem(marshalViewStorageKeyV2, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return changed ? next : prev;
    });
  }, [showMarshalOps, showResultOps, marshalViewStorageKeyV2]);

  const roundTabDisplayLabels = useMemo(
    () => defaultStartListRoundTabLabels(tabs.length),
    [tabs.length]
  );

  const isTeam = event.type === "TEAM";
  const total = isTeam ? teams.length : individuals.length;
  const heatLockedByMarshal = Boolean(marshalStartedAtIso);
  const heatPlanConfirmed = Boolean(heatPlanConfirmedAtIso);

  const effectivePreliminaryLanesForPreview = useMemo(
    () => preliminaryHeatLaneCount ?? defaultMaxLanesPerRace ?? null,
    [preliminaryHeatLaneCount, defaultMaxLanesPerRace]
  );

  const liveHeatsByTab = useMemo(() => {
    const eventHeatSetting = pickSetting(parsed.eventSettings, event.id);
    return getLiveHeatsByTab({
      liveTabs: tabs,
      individuals,
      teams,
      isTeam,
      preliminaryHeatLaneCount: effectivePreliminaryLanesForPreview,
      officialRanksByRound,
      placementSeed,
      frozenSnapshotRounds,
      heatPlanStep1Confirmed: heatPlanConfirmed,
      eventHeatSetting,
    });
  }, [
    tabs,
    individuals,
    teams,
    isTeam,
    effectivePreliminaryLanesForPreview,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    heatPlanConfirmed,
    parsed.eventSettings,
    event.id,
  ]);

  const tabCount = tabs.length;

  const activeTabIndex = useMemo(() => {
    const i = tabs.findIndex((t) => t.id === selectedTabId);
    if (i >= 0) return i;
    return tabs.length > 0 ? 0 : -1;
  }, [tabs, selectedTabId]);

  const listMarshalRound =
    activeTabIndex >= 0 && tabCount >= 1
      ? snapshotRoundForTab(activeTabIndex, tabCount)
      : null;

  const marshalRoundMismatch = Boolean(
    listMarshalApiRound && listMarshalRound && listMarshalApiRound !== listMarshalRound
  );
  /** PUT / 締切 / リザルト API はスナップショット実効ラウンドと一致させる */
  const listMarshalRoundForMutations = listMarshalApiRound ?? listMarshalRound;

  const activeTabIdResolved = tabs[activeTabIndex]?.id ?? "";
  const activeViewMode: StartListMarshalViewMode =
    marshalViewModeByTab[activeTabIdResolved] ?? "normal";

  const refetchResultCapture = useCallback(async () => {
    if (!showResultOps || !listMarshalRound) return;
    try {
      await measureDayOpsAsync("day-ops heat-result-capture", async () => {
        const data = await getHeatResultCapture(competitionId, event.id, listMarshalRound);
        setListResultLocked(Boolean(data.lockedAt));
        setListResultRows(data.rows);
        setListResultConfirmedHeats(data.confirmedHeats);
      });
    } catch {
      /* 楽観更新を維持 */
    }
  }, [showResultOps, listMarshalRound, competitionId, event.id]);

  useEffect(() => {
    if (!showResultOps || listMarshalRound === null || activeViewMode !== "result") {
      setListResultRows([]);
      setListResultLocked(false);
      setListResultLoading(false);
      setListResultConfirmedHeats([]);
      return;
    }
    let cancelled = false;
    setListResultLoading(true);
    void getHeatResultCapture(competitionId, event.id, listMarshalRound)
      .then((data) => {
        if (cancelled) return;
        setListResultLocked(Boolean(data.lockedAt));
        setListResultRows(data.rows);
        setListResultConfirmedHeats(data.confirmedHeats);
      })
      .catch(() => {
        if (!cancelled) {
          setListResultRows([]);
          setListResultLocked(false);
          setListResultConfirmedHeats([]);
        }
      })
      .finally(() => {
        if (!cancelled) setListResultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showResultOps, listMarshalRound, activeViewMode, competitionId, event.id]);

  const fetchListMarshalHeatsCore = useCallback(
    async (signal?: AbortSignal) => {
      if (!listMarshalRound) return;
      await measureDayOpsAsync("day-ops heat-marshal", async () => {
        const res = await fetch(
          `/api/competitions/${competitionId}/day-ops/heat-marshal?eventId=${encodeURIComponent(event.id)}&round=${encodeURIComponent(listMarshalRound)}`,
          { signal }
        );
        if (!res.ok) {
          setListMarshalHeats(null);
          setListMarshalApiRound(null);
          return;
        }
        const data = (await res.json()) as { heats?: HeatMarshalHeatRow[]; round?: unknown };
        setListMarshalHeats(data.heats ?? []);
        setListMarshalApiRound(parseHeatMarshalResponseRound(data.round));
      });
    },
    [competitionId, event.id, listMarshalRound]
  );

  const refetchListMarshalHeats = useCallback(async () => {
    try {
      await fetchListMarshalHeatsCore();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setListMarshalHeats(null);
      setListMarshalApiRound(null);
    }
  }, [fetchListMarshalHeatsCore]);

  /** マーシャル GET と（リザルトモード時のみ）着順キャプチャ GET をまとめて再取得 */
  const refreshMarshalAndResultLists = useCallback(() => {
    if (activeViewMode !== "normal") {
      void refetchListMarshalHeats();
    }
    if (activeViewMode === "result" && showResultOps) {
      void refetchResultCapture();
    }
  }, [activeViewMode, refetchListMarshalHeats, refetchResultCapture, showResultOps]);

  useEffect(() => {
    if (!showDayOpsShell || listMarshalRound === null) {
      setListMarshalHeats(null);
      setListMarshalApiRound(null);
      setListMarshalLoading(false);
      return;
    }
    const ac = new AbortController();
    setListMarshalLoading(true);
    setListMarshalApiRound(null);
    void fetchListMarshalHeatsCore(ac.signal)
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setListMarshalHeats(null);
        setListMarshalApiRound(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setListMarshalLoading(false);
      });
    return () => ac.abort();
  }, [showDayOpsShell, listMarshalRound, fetchListMarshalHeatsCore]);

  useEffect(() => {
    if (!showDayOpsShell) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refreshDayOpsParticipantPoll();
      refreshMarshalAndResultLists();
    };
    const intervalMs =
      activeViewMode === "normal"
        ? DAY_OPS_POLL_INTERVAL_NORMAL_MS
        : DAY_OPS_POLL_INTERVAL_SYNC_MS;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [
    showDayOpsShell,
    activeViewMode,
    refreshDayOpsParticipantPoll,
    refreshMarshalAndResultLists,
  ]);

  /** バックグラウンドから戻った直後に他端末の更新を取り込む */
  useEffect(() => {
    if (!showDayOpsShell) return;
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      void refreshDayOpsParticipantPoll();
      refreshMarshalAndResultLists();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [showDayOpsShell, refreshDayOpsParticipantPoll, refreshMarshalAndResultLists]);

  useEffect(() => {
    if (!showDayOpsShell) return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ competitionId?: string; eventId?: string }>).detail;
      if (d?.competitionId === competitionId && d?.eventId === event.id) {
        void refreshDayOpsParticipantPoll();
        refreshMarshalAndResultLists();
      }
    };
    window.addEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
    return () => window.removeEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
  }, [
    showDayOpsShell,
    competitionId,
    event.id,
    refreshDayOpsParticipantPoll,
    refreshMarshalAndResultLists,
  ]);

  /** 別ブラウザ向け: DB fingerprint を SSE で監視（`NEXT_PUBLIC_DAY_OPS_LIVE_STREAM=1`）。リザルトドラフトのサーバー同期は `NEXT_PUBLIC_DAY_OPS_RESULT_DRAFT_SYNC=1`。 */
  useEffect(() => {
    if (!showDayOpsShell || process.env.NEXT_PUBLIC_DAY_OPS_LIVE_STREAM !== "1") return;
    const url = `/api/competitions/${competitionId}/day-ops/live-events?eventId=${encodeURIComponent(event.id)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "changes") {
          void refreshDayOpsParticipantPoll();
          refreshMarshalAndResultLists();
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      es.close();
    };
  }, [
    showDayOpsShell,
    competitionId,
    event.id,
    refreshDayOpsParticipantPoll,
    refreshMarshalAndResultLists,
  ]);

  const listMarshalHeatsByIndex = useMemo(() => {
    const m = new Map<number, HeatMarshalHeatRow>();
    if (!listMarshalHeats?.length) return m;
    for (const h of listMarshalHeats) {
      const n = Number(h.heatIndex);
      if (Number.isFinite(n)) m.set(n, h);
    }
    return m;
  }, [listMarshalHeats]);

  /** 各ラウンドタブの先頭に置く表示モード切り替え（localStorage はタブ ID 単位） */
  const renderMarshalModeBar = (tabId: string, tabIndex: number) => {
    if (!showDayOpsShell || !heatPlanConfirmed || !tabId) return null;
    const roundName =
      roundTabDisplayLabels[tabIndex]?.trim() || `ラウンド ${tabIndex + 1}`;
    const mode: StartListMarshalViewMode = marshalViewModeByTab[tabId] ?? "normal";
    const highlightMarshal = mode === "marshal";
    const highlightResult = mode === "result";
    return (
      <div
        className={cn(
          "rounded-xl border p-3 shadow-sm transition-colors sm:p-3.5",
          highlightMarshal
            ? "border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-800/80 dark:bg-emerald-950/30"
            : highlightResult
              ? "border-violet-200/90 bg-violet-50/40 dark:border-violet-800/80 dark:bg-violet-950/25"
              : "border-border/70 bg-muted/15"
        )}
        role="region"
        aria-label={`${roundName}のスタートリスト表示`}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="min-w-0 text-xs font-semibold text-foreground">
              表示モード
              {tabCount > 1 ? (
                <span className="ml-1.5 font-normal text-muted-foreground">（{roundName}）</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              現在:{" "}
              {mode === "normal" ? "通常" : mode === "marshal" ? "マーシャル" : "リザルト"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:w-[min(100%,22rem)]">
            <div className="flex flex-wrap gap-0 rounded-lg border border-border/80 bg-background p-0.5 shadow-inner">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                  mode === "normal" && "bg-muted text-foreground shadow-sm"
                )}
                aria-pressed={mode === "normal"}
                onClick={() => persistMarshalViewMode(tabId, "normal")}
              >
                <LayoutList className="size-3.5 shrink-0 opacity-80" aria-hidden />
                通常
              </Button>
              {showMarshalOps ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                  "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                    highlightMarshal &&
                      "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  )}
                  aria-pressed={highlightMarshal}
                  onClick={() => {
                    flushSync(() => {
                      persistMarshalViewMode(tabId, "marshal");
                    });
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new Event("jla-marshal-nfc-arm"));
                    }
                  }}
                >
                  <ListChecks className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  マーシャル
                </Button>
              ) : null}
              {showResultOps ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                  "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                    highlightResult &&
                      "bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:text-white dark:bg-violet-700 dark:hover:bg-violet-600"
                  )}
                  aria-pressed={highlightResult}
                  onClick={() => {
                    flushSync(() => {
                      persistMarshalViewMode(tabId, "result");
                    });
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new Event("jla-result-nfc-arm"));
                    }
                  }}
                >
                  <Trophy className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  リザルト
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderListBlock = (index: number) => {
    if (total === 0) {
      return (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">この種目にエントリーはまだありません</p>
        </div>
      );
    }
    const row = liveHeatsByTab[index];
    const heatsLen = row
      ? isTeam
        ? row.teamHeats.length
        : row.individualHeats.length
      : 0;
    let heatAdvanceQuotasForRow = row?.heatAdvanceQuotas ?? null;
    const roundForList = tabCount >= 1 ? snapshotRoundForTab(index, tabCount) : null;
    const tabIdForRow = tabs[index]?.id ?? "";
    const viewModeForRow: StartListMarshalViewMode =
      tabIdForRow && marshalViewModeByTab[tabIdForRow]
        ? marshalViewModeByTab[tabIdForRow]
        : "normal";
    if (
      row &&
      heatsLen > 0 &&
      viewModeForRow === "result" &&
      index === 0 &&
      activeTabIndex === index &&
      tabCount >= 2 &&
      typeof effectivePreliminaryLanesForPreview === "number" &&
      effectivePreliminaryLanesForPreview >= 1 &&
      heatPlanConfirmed &&
      !marshalRoundMismatch &&
      listMarshalHeats &&
      listMarshalHeats.length > 0
    ) {
      const calledSizes = Array.from({ length: heatsLen }, (_, heatIndex) => {
        const displayNum = row.marshalDisplayHeatIndices?.[heatIndex] ?? heatIndex + 1;
        const apiHeat = listMarshalHeatsByIndex.get(Number(displayNum));
        if (!apiHeat?.participants?.length) return 0;
        return apiHeat.participants.filter((p) => p.status === "CALLED").length;
      });
      const totalCalled = calledSizes.reduce((a, b) => a + b, 0);
      if (totalCalled > 0) {
        heatAdvanceQuotasForRow = computeLiveFirstRoundAdvanceQuotas({
          heatSizes: calledSizes,
          totalParticipants: totalCalled,
          liveTabs: tabs,
          preliminaryHeatLaneCount: effectivePreliminaryLanesForPreview,
          eventHeatSetting: pickSetting(parsed.eventSettings, event.id),
        });
      }
    }
    const marshalUiModeForRow =
      viewModeForRow === "marshal"
        ? ("inline" as const)
        : viewModeForRow === "result"
          ? ("result" as const)
          : ("dialog" as const);
    const startListMarshal =
      showDayOpsShell && activeTabIndex === index && listMarshalRound !== null
        ? {
            heats: listMarshalHeats,
            loading: listMarshalLoading,
            round: listMarshalRoundForMutations ?? listMarshalRound,
            competitionId,
            marshalOpsBlocked: !heatPlanConfirmed || marshalRoundMismatch,
            marshalRoundMismatch,
            /** 種目全体の dayOps 締切はマーシャルに使わない（各ラウンド・ヒートの締切は heat-marshal API の callClosedAt） */
            isCallClosed: false,
            marshalUiMode: marshalUiModeForRow,
            resultCapture:
              viewModeForRow === "result"
                ? {
                    rows: listResultRows,
                    locked: listResultLocked,
                    loading: listResultLoading,
                    confirmedHeats: listResultConfirmedHeats,
                    onRefetch: refetchResultCapture,
                  }
                : undefined,
            onMarshalSuccess: async () => {
              await refreshDayOpsParticipantPoll();
              await refetchListMarshalHeats();
              await refetchResultCapture();
              router.refresh();
              dispatchJlaDayOpsParticipantStatusChanged(competitionId, event.id);
            },
          }
        : null;
    return (
      <LiveRoundContent
        key={`sl-${event.id}-${index}-${viewModeForRow}`}
        eventId={event.id}
        isTeam={isTeam}
        heatPlanConfirmedForDsq={heatPlanConfirmed}
        individualHeats={row?.individualHeats ?? []}
        teamHeats={row?.teamHeats ?? []}
        marshalDisplayHeatIndices={row?.marshalDisplayHeatIndices ?? null}
        heatAdvanceQuotas={heatAdvanceQuotasForRow}
        startListMarshal={startListMarshal}
        participantStatusRows={
          polledParticipantStatusRows.length > 0 ? polledParticipantStatusRows : null
        }
        marshalRoundForDisplay={roundForList}
        participantStatusByKey={participantStatusByKey}
      />
    );
  };

  const useTabsChrome = tabCount > 1;

  const archiveLabel = archiveRecordedAtIso
    ? new Date(archiveRecordedAtIso).toLocaleString("ja-JP")
    : null;

  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <>
    <Card className="overflow-hidden border-border/80 py-0 shadow-md">
      <CardHeader className="space-y-3 border-b border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold leading-snug tracking-tight sm:text-lg">
                  {event.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">スタートリスト</p>
              </div>
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="shrink-0 font-medium text-foreground/80">
                {sexLabel(event.sex)}
                {event.type === "TEAM" ? "・団体" : "・個人"}
              </span>
              <span className="hidden text-border sm:inline" aria-hidden>
                ·
              </span>
              <span className="min-w-0 truncate">{competitionName}</span>
            </p>
            {event.ageCategoryName ? (
              <p className="text-xs text-muted-foreground">カテゴリ: {event.ageCategoryName}</p>
            ) : null}
            {scheduleLabel ? (
              <p className="text-xs font-medium text-foreground">進行予定: {scheduleLabel}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <Badge variant="secondary" className="gap-1 font-normal tabular-nums">
              <Users className="size-3 opacity-70" aria-hidden />
              {isTeam ? "チーム" : "選手"}{" "}
              <span className="font-semibold">{total}</span>
            </Badge>
            {!heatPlanConfirmed ? (
              <Badge
                variant="outline"
                className="border-amber-400/80 bg-amber-50 font-normal text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              >
                ヒート・レーン未確定
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/50 bg-emerald-50 font-normal text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100"
              >
                ヒート確定済み
              </Badge>
            )}
            {heatLockedByMarshal ? (
              <Badge variant="outline" className="font-normal">
                分割固定
              </Badge>
            ) : null}
          </div>
        </div>
        {archiveLabel ? (
          <p
            className="text-[11px] text-muted-foreground"
            title={
              frozenSnapshotRounds?.length
                ? "確定ラウンドは記録どおり、未確定は最新エントリーで再計算"
                : "表示は最新エントリーに追随"
            }
          >
            記録: {archiveLabel}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 sm:px-5">
        {!heatPlanConfirmed && !canEditHeatConfiguration ? (
          <p className="text-xs text-muted-foreground">主催者のヒート・レーン確定待ちです。</p>
        ) : null}
        {canEditHeatConfiguration && !heatPlanConfirmed ? (
          <div className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 text-xs leading-relaxed">
            <p className="font-medium text-foreground">ラウンド・ヒート・レーン</p>
            <p className="mt-1 text-muted-foreground">
              大会ページの「スタートリスト」タブで、種目一覧の「ラウンド設定」から「ヒート・レーンを保存」まで完了してください（保存と同時に確定が記録されます）。1レースあたりの最大レーン数（全ラウンド共通）は「大会設定 → 種目・参加費」で編集できます。
            </p>
            <div className="mt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link href={`/competitions/${competitionId}?tab=start-list`}>スタートリスト設定へ</Link>
              </Button>
            </div>
          </div>
        ) : null}
        {selectedTabId && tabCount > 0 ? (
          useTabsChrome ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">リスト</p>
              <Tabs value={selectedTabId} onValueChange={setActiveTabUserPick} className="w-full">
              <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1.5">
                {tabs.map((t, index) => {
                  const row = liveHeatsByTab[index];
                  const heatCount = isTeam
                    ? (row?.teamHeats.length ?? 0)
                    : (row?.individualHeats.length ?? 0);
                  const baseLabel =
                    roundTabDisplayLabels[index]?.trim() || `#${index + 1}`;
                  const tabText = formatStartListTabLabelWithHeatCount(
                    baseLabel,
                    heatCount
                  );
                  return (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className="max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2.5 py-1.5 text-xs data-[state=active]:shadow-sm sm:max-w-[16rem]"
                      title={tabText}
                    >
                      {tabText}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {tabs.map((t, index) => (
                <TabsContent key={t.id} value={t.id} className="mt-3 space-y-3">
                  {renderMarshalModeBar(t.id, index)}
                  <div className="rounded-lg border border-border/50 bg-muted/5 p-2 sm:p-3">
                    {renderListBlock(index)}
                  </div>
                </TabsContent>
              ))}
              </Tabs>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">リスト</p>
              <div className="space-y-3">
                {selectedTabId ? renderMarshalModeBar(selectedTabId, 0) : null}
                <div className="rounded-lg border border-border/50 bg-muted/5 p-2 sm:p-3">
                  {renderListBlock(0)}
                </div>
              </div>
            </div>
          )
        ) : null}
        <details className="group rounded-lg border border-border/60 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground">
            <CircleHelp className="size-3.5 shrink-0 opacity-80" aria-hidden />
            <span>ヘルプ</span>
            <ChevronDown
              className="ml-auto size-3.5 shrink-0 opacity-70 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-2 border-t border-border/50 px-2.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">ラウンド・ヒート・レーン</span>
              ：大会ページのスタートリスト（種目一覧のラウンド設定）で「ヒート・レーンを保存」まで完了すると当日運用に進めます。マーシャル開始後は分割変更不可。
            </p>
            <p>
              <span className="font-medium text-foreground">ステップ2</span>
              ：タブでラウンド切替。1レースあたりの最大レーン数（全ラウンド共通）は「大会設定 → 種目・参加費」で編集します。
            </p>
            {tabCount >= 2 ? (
              <p>
                複数ラウンド時、先頭のヒート見出しには次ラ定員を人数比で配分した進出数を表示します（
                <span className="whitespace-nowrap font-mono text-[10px] text-foreground/80">
                  min(次ラヒート×レーン, 参加数)
                </span>
                ）。
              </p>
            ) : null}
            {showDayOpsShell ? (
              <p>
                {showMarshalOps ? (
                  <>
                    <span className="font-medium text-foreground">表示モード</span>
                    ：通常＝一覧のみ。マーシャル＝召集・NFC・ヒート締切（締切前は付け外し可）。リザルト＝召集済みのみ着順入力・NFC。
                    マーシャル締切は各ヒート見出しから。タブごとにモードは独立です。
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">表示モード</span>
                    ：通常＝一覧。リザルト＝着順入力（本画面のインライン）。
                  </>
                )}
              </p>
            ) : null}
            <p className="text-[11px]">
              表示データ：{frozenSnapshotRounds?.length
                ? "確定ラウンドは記録どおり、未確定は最新エントリーで再計算。"
                : "最新エントリーに追随。"}
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
    </>
  );
}
