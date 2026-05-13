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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  applyDefaultRoundTabLabels,
  buildRoundTabsForRoundCount,
  buildStartListSettingsPayload,
  coerceRoundTabsToHeatOnly,
  defaultStartListRoundTabLabels,
  normalizeRoundTabs,
  parseStartListSettings,
  resolveTabMaxLanes,
  type HeatSetting,
  type StartListRoundTab,
} from "@/lib/startListSettings";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { LiveRoundContent, sexLabel } from "@/components/StartListRoundListPanels";
import { getHeatResultCapture, type HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { cn } from "@/lib/utils";
import { clampRoundTabsToNonIncreasingHeatCounts } from "@/lib/startListEventHeatValidation";
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
  allEventIds: string[];
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
  /** ステップ1確定日時（ISO）。未確定の間は当日マーシャル不可 */
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
  /** false のときステップ1ヒート設定を編集不可（レコーダー等） */
  canEditHeatConfiguration?: boolean;
  /** true のときのみ最大レーン数を Event に PATCH 可能（主催団体管理者） */
  canEditPreliminaryLanes?: boolean;
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

function clampStartListRoundCountInput(n: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 1;
  return Math.min(32, Math.max(1, n));
}

function parseMaxLanesDraft(
  raw: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = parseInt(t, 10);
  if (!Number.isInteger(n) || n < 1 || n > 32) {
    return {
      ok: false,
      message: "最大レーン数は1〜32の整数、または空欄（未設定）にしてください",
    };
  }
  return { ok: true, value: n };
}

function heatSettingFromTabs(tabs: StartListRoundTab[]): HeatSetting {
  const first = tabs[0];
  if (!first) {
    return { mode: "count", heatCount: "1", heatSize: "", roundTabs: [] };
  }
  return {
    roundTabs: tabs,
    mode: first.mode,
    heatCount: first.heatCount,
    heatSize: first.heatSize,
  };
}

export default function StartListEventUnifiedCard({
  competitionId,
  competitionName,
  archiveRecordedAtIso,
  event,
  allEventIds,
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
  canEditPreliminaryLanes = false,
  participantStatusByKey,
  initialParticipantStatusRows,
}: Props) {
  const showMarshalOps = showMarshalOpsProp ?? showMarshalHeatLinks;
  const showResultOps = showResultOpsProp ?? showMarshalHeatLinks;
  const showDayOpsShell = showMarshalOps || showResultOps;

  const router = useRouter();
  const parsed = useMemo(() => parseStartListSettings(initialSettings), [initialSettings]);
  const [tabs, setTabs] = useState<StartListRoundTab[]>(() =>
    deriveRoundTabsForEditor(
      parsed.eventSettings,
      event.id,
      configuredStartListRoundCount,
      entryCount
    )
  );
  const [maxLanesDraft, setMaxLanesDraft] = useState(() =>
    typeof preliminaryHeatLaneCount === "number" && preliminaryHeatLaneCount >= 1
      ? String(Math.min(32, preliminaryHeatLaneCount))
      : ""
  );
  const [roundCountDraft, setRoundCountDraft] = useState(() => {
    const nt = deriveRoundTabsForEditor(
      parsed.eventSettings,
      event.id,
      configuredStartListRoundCount,
      entryCount
    );
    return String(clampStartListRoundCountInput(nt.length));
  });
  const [step1Saving, setStep1Saving] = useState(false);
  /** ステップ1確定後は既定で畳み、「編集」でフォームを開く */
  const [step1EditorOpen, setStep1EditorOpen] = useState(() => !heatPlanConfirmedAtIso);
  const [activeTabId, setActiveTabId] = useState<string>("");
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

  useEffect(() => {
    const nextTabs = deriveRoundTabsForEditor(
      parsed.eventSettings,
      event.id,
      configuredStartListRoundCount,
      entryCount
    );
    setTabs(nextTabs);
    setRoundCountDraft(String(clampStartListRoundCountInput(nextTabs.length)));
    setMaxLanesDraft(
      typeof preliminaryHeatLaneCount === "number" && preliminaryHeatLaneCount >= 1
        ? String(Math.min(32, preliminaryHeatLaneCount))
        : ""
    );
  }, [
    event.id,
    initialSettings,
    parsed.eventSettings,
    configuredStartListRoundCount,
    entryCount,
    preliminaryHeatLaneCount,
  ]);

  useEffect(() => {
    const fid = tabs[0]?.id ?? "";
    if (!fid) {
      setActiveTabId("");
      return;
    }
    setActiveTabId((cur) => (cur && tabs.some((t) => t.id === cur) ? cur : fid));
  }, [tabs]);

  useEffect(() => {
    if (!heatPlanConfirmedAtIso) {
      setStep1EditorOpen(true);
    }
  }, [heatPlanConfirmedAtIso]);

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

  useEffect(() => {
    if (marshalStartedAtIso) {
      setStep1EditorOpen(false);
    }
  }, [marshalStartedAtIso]);

  const roundTabDisplayLabels = useMemo(
    () => defaultStartListRoundTabLabels(tabs.length),
    [tabs.length]
  );

  const isTeam = event.type === "TEAM";
  const total = isTeam ? teams.length : individuals.length;
  const heatLockedByMarshal = Boolean(marshalStartedAtIso);
  const heatPlanConfirmed = Boolean(heatPlanConfirmedAtIso);
  const canEditStep1Heats = !heatLockedByMarshal;
  const showStep1FullForm =
    canEditHeatConfiguration && (!heatPlanConfirmed || (step1EditorOpen && canEditStep1Heats));

  const effectivePreliminaryLanesForPreview = useMemo(() => {
    if (canEditPreliminaryLanes) {
      const p = parseMaxLanesDraft(maxLanesDraft);
      if (p.ok) return p.value;
    }
    return preliminaryHeatLaneCount ?? defaultMaxLanesPerRace ?? null;
  }, [
    canEditPreliminaryLanes,
    maxLanesDraft,
    preliminaryHeatLaneCount,
    defaultMaxLanesPerRace,
  ]);

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

  const step1CompactSummary = useMemo(() => {
    if (tabs.length === 0) return "";
    const common = effectivePreliminaryLanesForPreview;
    return tabs
      .map((t, index) => {
        const label = roundTabDisplayLabels[index]?.trim() || `ラウンド${index + 1}`;
        const n = Math.max(1, parseInt(String(t.heatCount || "1"), 10) || 1);
        const effL = resolveTabMaxLanes(t, common ?? null);
        const showLane =
          typeof effL === "number" &&
          (t.maxLanesPerHeat !== undefined ||
            typeof common !== "number" ||
            effL !== common);
        const laneSuffix = showLane ? `·L${effL}` : "";
        return `${label} ${n}ヒート${laneSuffix}`;
      })
      .join(" · ");
  }, [tabs, roundTabDisplayLabels, effectivePreliminaryLanesForPreview]);

  const tabCount = tabs.length;

  const activeTabIndex = useMemo(() => {
    const i = tabs.findIndex((t) => t.id === activeTabId);
    if (i >= 0) return i;
    return tabs.length > 0 ? 0 : -1;
  }, [tabs, activeTabId]);

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

  const resetStep1TabsFromServer = () => {
    const nextTabs = deriveRoundTabsForEditor(
      parsed.eventSettings,
      event.id,
      configuredStartListRoundCount,
      entryCount
    );
    setTabs(nextTabs);
    setRoundCountDraft(String(clampStartListRoundCountInput(nextTabs.length)));
    setMaxLanesDraft(
      typeof preliminaryHeatLaneCount === "number" && preliminaryHeatLaneCount >= 1
        ? String(Math.min(32, preliminaryHeatLaneCount))
        : ""
    );
  };

  const persistTabs = async (successToast: string | null) => {
    if (heatLockedByMarshal) {
      toast.error("マーシャル開始後はヒート分割を変更できません");
      return false;
    }

    const lanesParsed = parseMaxLanesDraft(maxLanesDraft);
    if (!lanesParsed.ok) {
      toast.error(lanesParsed.message);
      return false;
    }

    const rcTrim = roundCountDraft.trim();
    const rcNum = parseInt(rcTrim, 10);
    if (!Number.isInteger(rcNum) || rcNum < 1 || rcNum > 32) {
      toast.error("ラウンド数は1〜32の整数にしてください");
      return false;
    }

    let workingTabs = tabs;
    if (workingTabs.length !== rcNum) {
      workingTabs = buildRoundTabsForRoundCount(rcNum, workingTabs);
      setTabs(workingTabs);
      setRoundCountDraft(String(clampStartListRoundCountInput(rcNum)));
    }

    const normalized = applyDefaultRoundTabLabels(workingTabs).map((row) => ({
      ...row,
      mode: "count" as const,
      heatSize: "",
    }));

    const maxLanesForClamp = canEditPreliminaryLanes
      ? lanesParsed.value
      : preliminaryHeatLaneCount ?? defaultMaxLanesPerRace ?? null;

    const clamped = clampRoundTabsToNonIncreasingHeatCounts(
      normalized,
      entryCount,
      maxLanesForClamp
    );
    let heatAdjusted = false;
    for (let i = 0; i < normalized.length; i += 1) {
      if (normalized[i]!.heatCount !== clamped[i]!.heatCount) {
        heatAdjusted = true;
        break;
      }
    }
    if (heatAdjusted) {
      const byId = new Map(clamped.map((t) => [t.id, t]));
      setTabs((prev) =>
        prev.map((row) => {
          const c = byId.get(row.id);
          if (!c) return row;
          return {
            ...row,
            heatCount: c.heatCount,
            mode: c.mode,
            heatSize: c.heatSize,
            maxLanesPerHeat: c.maxLanesPerHeat,
          };
        })
      );
      toast.info("後続ラウンドのヒート数を、前ラウンドのヒート数以下に調整しました");
    }

    if (canEditPreliminaryLanes) {
      const nextLanes = lanesParsed.value;
      const prevLanes = preliminaryHeatLaneCount ?? null;
      const lanesChanged = (nextLanes ?? null) !== (prevLanes ?? null);
      if (lanesChanged) {
        try {
          const laneRes = await fetch(
            `/api/competitions/${competitionId}/events/${event.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ preliminaryHeatLaneCount: nextLanes }),
            }
          );
          const laneData = (await laneRes.json().catch(() => ({}))) as { message?: string };
          if (!laneRes.ok) {
            throw new Error(laneData.message || "最大レーン数の保存に失敗しました");
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "最大レーン数の保存に失敗しました");
          return false;
        }
      }
    }

    const roundTabsForPayload: StartListRoundTab[] = canEditPreliminaryLanes
      ? clamped.map((row) => {
          const ml = row.maxLanesPerHeat;
          if (typeof ml !== "number" || !Number.isInteger(ml) || ml < 1 || ml > 32) {
            const { maxLanesPerHeat: _omit, ...rest } = row;
            void _omit;
            return rest;
          }
          return { ...row, maxLanesPerHeat: Math.floor(ml) };
        })
      : clamped.map(({ maxLanesPerHeat: _omit, ...rest }) => {
          void _omit;
          return rest;
        });

    const payloadSetting = heatSettingFromTabs(roundTabsForPayload);
    const nextEvents: Record<string, HeatSetting> = {};
    for (const id of allEventIds) {
      nextEvents[id] =
        id === event.id ? payloadSetting : pickSetting(parsed.eventSettings, id);
    }
    try {
      const response = await fetch(`/api/competitions/${competitionId}/start-list-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startListSettings: buildStartListSettingsPayload({
            eventSettings: nextEvents,
            teamAssignmentDeadline: parsed.teamAssignmentDeadline,
          }),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "保存に失敗しました");
      }

      try {
        const capRes = await fetch(
          `/api/competitions/${competitionId}/start-list-snapshot/capture`,
          { method: "POST" }
        );
        const capJson = (await capRes.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!capRes.ok) {
          toast.error(
            capJson.error ||
              capJson.message ||
              "スタートリスト記録の更新に失敗しました（ヒート設定は保存済みです）。もう一度保存してください。"
          );
          router.refresh();
          return false;
        }
      } catch {
        toast.error(
          "スタートリスト記録の更新に失敗しました（ヒート設定は保存済みです）。通信を確認のうえ、もう一度保存してください。"
        );
        router.refresh();
        return false;
      }

      if (successToast) {
        toast.success(successToast);
      }
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
      return false;
    }
  };

  /** ステップ1の単一ボタン: 未確定なら保存＋確定、確定済みなら保存のみ */
  const handleStep1Primary = async () => {
    setStep1Saving(true);
    try {
      const saved = await persistTabs(null);
      if (!saved) return;

      if (!heatPlanConfirmed) {
        const response = await fetch(
          `/api/competitions/${competitionId}/events/${event.id}/heat-plan/confirm`,
          { method: "POST" }
        );
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          throw new Error(data.message || "確定に失敗しました");
        }
        toast.success(data.message || "ステップ1を確定しました（ヒート設定を保存済み）");
      } else {
        toast.success("ヒート設定を保存しました");
      }
      setStep1EditorOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setStep1Saving(false);
    }
  };

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
                ステップ1 未確定
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
        {!showStep1FullForm &&
        !canEditHeatConfiguration &&
        !heatPlanConfirmed ? (
          <p className="text-xs text-muted-foreground">
            主催者のステップ1確定待ちです。
          </p>
        ) : null}
        {heatPlanConfirmed && tabCount > 0 && !showStep1FullForm ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold text-foreground">
                ラウンド設定
                {heatLockedByMarshal ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">（固定）</span>
                ) : null}
              </p>
              <p className="break-words text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                {step1CompactSummary}
              </p>
            </div>
            {canEditHeatConfiguration && canEditStep1Heats ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 px-3 text-xs"
                disabled={step1Saving}
                onClick={() => setStep1EditorOpen(true)}
              >
                編集
              </Button>
            ) : null}
          </div>
        ) : null}
        {tabCount > 0 && showStep1FullForm ? (
          <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-l-2 border-primary/60 pl-3">
              <p className="text-sm font-semibold text-foreground">ラウンド設定</p>
              {tabCount >= 2 ? (
                <span className="text-[11px] text-muted-foreground">後続 ≤ 前</span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="start-list-max-lanes" className="text-xs text-muted-foreground">
                  共通の最大レーン数（1レースあたり）
                </Label>
                <Input
                  id="start-list-max-lanes"
                  numericInput="integer"
                  min={1}
                  max={32}
                  className="h-9 w-full max-w-[10rem] px-2 text-sm tabular-nums sm:max-w-none"
                  disabled={heatLockedByMarshal || !canEditPreliminaryLanes}
                  value={maxLanesDraft}
                  onChange={(e) => setMaxLanesDraft(e.target.value)}
                  aria-describedby={
                    !canEditPreliminaryLanes ? "start-list-max-lanes-hint" : undefined
                  }
                />
                {!canEditPreliminaryLanes ? (
                  <p id="start-list-max-lanes-hint" className="text-[11px] text-muted-foreground">
                    主催団体の管理者のみ変更できます（当日運用アンロックのみでは変更不可）。
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="start-list-round-count" className="text-xs text-muted-foreground">
                  ラウンド数
                </Label>
                <Input
                  id="start-list-round-count"
                  numericInput="integer"
                  min={1}
                  max={32}
                  className="h-9 w-full max-w-[10rem] px-2 text-sm tabular-nums sm:max-w-none"
                  disabled={heatLockedByMarshal}
                  value={roundCountDraft}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRoundCountDraft(value);
                    const n = parseInt(value.trim(), 10);
                    if (Number.isInteger(n) && n >= 1 && n <= 32) {
                      setTabs((prev) => buildRoundTabsForRoundCount(n, prev));
                    }
                  }}
                />
              </div>
            </div>
            <ul className="space-y-2">
              {tabs.map((t, index) => {
                const roundTitle =
                  roundTabDisplayLabels[index]?.trim() || `ラウンド${index + 1}`;
                return (
                  <li
                    key={t.id}
                    className="space-y-2 rounded-lg border border-border/60 bg-background p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        {index + 1}
                      </Badge>
                      <p className="text-xs font-semibold text-foreground sm:text-sm">{roundTitle}</p>
                    </div>
                    {index === 0 ? (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        「大会設定 → 種目・参加費」でも同じ項目を変えられます。当日はここからまとめて保存できます。
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-xs text-muted-foreground">ヒート数</span>
                      <Input
                        numericInput="integer"
                        min={1}
                        className="h-9 w-14 px-2 text-center text-sm tabular-nums"
                        disabled={heatLockedByMarshal}
                        value={t.heatCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTabs((prev) => {
                            const patched = prev.map((row) =>
                              row.id === t.id
                                ? {
                                    ...row,
                                    heatCount: value,
                                    mode: "count" as const,
                                    heatSize: "",
                                  }
                                : row
                            );
                            return clampRoundTabsToNonIncreasingHeatCounts(
                              patched,
                              entryCount,
                              effectivePreliminaryLanesForPreview
                            );
                          });
                        }}
                        aria-label={`${roundTitle} のヒート数`}
                      />
                      <span className="text-xs text-muted-foreground">最大レーン</span>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={32}
                        className="h-9 w-14 px-2 text-center text-sm tabular-nums"
                        disabled={heatLockedByMarshal || !canEditPreliminaryLanes}
                        placeholder="共通"
                        title="空欄のときは上の共通最大レーン数を使います"
                        value={t.maxLanesPerHeat != null ? String(t.maxLanesPerHeat) : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setTabs((prev) =>
                            prev.map((row) =>
                              row.id === t.id
                                ? {
                                    ...row,
                                    maxLanesPerHeat:
                                      raw === ""
                                        ? undefined
                                        : Math.min(32, Math.max(1, parseInt(raw, 10))),
                                  }
                                : row
                            )
                          );
                        }}
                        aria-label={`${roundTitle} の最大レーン数（空欄は共通）`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {canEditStep1Heats ? (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  保存すると、大会のスタートリスト記録（監査・マーシャル参照用）が、いまのヒート分割に合わせて上書きされます。未保存のときは記録だけが古い場合があります。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                {heatPlanConfirmed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 text-xs"
                    disabled={step1Saving}
                    onClick={() => {
                      resetStep1TabsFromServer();
                      setStep1EditorOpen(false);
                    }}
                  >
                    閉じる
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-9 px-4 text-xs sm:min-w-[8rem]"
                  disabled={step1Saving}
                  onClick={() => void handleStep1Primary()}
                >
                  {step1Saving
                    ? heatPlanConfirmed
                      ? "保存中…"
                      : "確定中…"
                    : heatPlanConfirmed
                      ? "ヒート設定を保存"
                      : "ステップ1を確定"}
                </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTabId && tabCount > 0 ? (
          useTabsChrome ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">リスト</p>
              <Tabs value={activeTabId} onValueChange={setActiveTabId} className="w-full">
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
                {activeTabId ? renderMarshalModeBar(activeTabId, 0) : null}
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
              <span className="font-medium text-foreground">ステップ1</span>
              ：ヒート数を設定し「ステップ1を確定」で保存。確定後にマーシャル可。マーシャル開始後は分割変更不可。
            </p>
            <p>
              <span className="font-medium text-foreground">ステップ2</span>
              ：タブでラウンド切替。ラウンド数・最大レーンは種目設定。
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
