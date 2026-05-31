"use client";

import type { ResultRound } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import { getHeatResultCapture, type HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import { parseHeatMarshalResponseRound } from "@/lib/parseHeatMarshalResponseRound";
import { snapshotRoundForTab } from "@/lib/startListEventTabDisplay";
import type {
  StartListMarshalViewMode,
  StartListEventParticipantStatusRow,
} from "@/lib/startListEventTypes";
import {
  applyMarshalDraftOpsToHeats,
  mergeListMarshalHeatsOnRefetch,
  mergeMarshalHeatSummaryLayer,
  patchHeatMarshalCallWindowInHeats,
} from "@/components/startListRoundList/panelHelpers";
import type { MarshalDraftOp, OnMarshalSuccessOptions } from "@/hooks/liveRound/types";
import { useDayOpsStartListPolling } from "@/hooks/useDayOpsStartListPolling";
import { dispatchJlaDayOpsParticipantStatusChanged } from "@/lib/dayOpsParticipantStatusDisplay";
import {
  confirmedHeatsEqual,
  mergeConfirmedHeats,
  marshalHeatsSemanticEqual,
  participantStatusPollRowsEqual,
  resultCaptureRowsEqual,
} from "@/lib/dayOpsPollCompare";
import { measureDayOpsAsync } from "@/lib/dayOpsMetrics";
import { dayOpsFetch } from "@/lib/dayOpsFetch";
import { dispatchJlaDayOpsDraftChanged } from "@/lib/dayOpsHeatOperationDraftSync";

type Args = {
  competitionId: string;
  eventId: string;
  showMarshalOps: boolean;
  showResultOps: boolean;
  initialParticipantStatusRows: ReadonlyArray<StartListEventParticipantStatusRow>;
  activeTabIndex: number;
  tabCount: number;
};

function marshalHeatsCacheKey(eventId: string, round: ResultRound): string {
  return `${eventId}:${round}`;
}

function marshalHeatsHaveParticipants(heats: HeatMarshalHeatRow[] | undefined): boolean {
  return Boolean(heats?.some((h) => h.participants.length > 0));
}

type HeatMarshalFetchPhase = "auto" | "full-only";

export function useStartListEventDayOps({
  competitionId,
  eventId,
  showMarshalOps,
  showResultOps,
  initialParticipantStatusRows,
  activeTabIndex,
  tabCount,
}: Args) {
  const showDayOpsShell = showMarshalOps || showResultOps;

  const [listMarshalHeats, setListMarshalHeats] = useState<HeatMarshalHeatRow[] | null>(null);
  const [listMarshalApiRound, setListMarshalApiRound] = useState<ResultRound | null>(null);
  /** 締切バッジ・締切ボタン向け（summary=1 完了で false） */
  const [listMarshalCallWindowLoading, setListMarshalCallWindowLoading] = useState(false);
  /** 参加者チェック・NFC 向け（全量 GET 完了で false） */
  const [listMarshalParticipantsLoading, setListMarshalParticipantsLoading] = useState(false);
  const [listResultRows, setListResultRows] = useState<HeatResultCaptureRow[]>([]);
  const [listResultLocked, setListResultLocked] = useState(false);
  const [listResultLoading, setListResultLoading] = useState(false);
  const [listResultConfirmedHeats, setListResultConfirmedHeats] = useState<number[]>([]);
  const [polledParticipantStatusRows, setPolledParticipantStatusRows] = useState<
    StartListEventParticipantStatusRow[]
  >(() => [...initialParticipantStatusRows]);
  const [marshalViewModeByTab, setMarshalViewModeByTab] = useState<
    Record<string, StartListMarshalViewMode>
  >({});

  const listMarshalRound =
    activeTabIndex >= 0 && tabCount >= 1
      ? snapshotRoundForTab(activeTabIndex, tabCount)
      : null;

  const marshalRoundMismatch = Boolean(
    listMarshalApiRound && listMarshalRound && listMarshalApiRound !== listMarshalRound
  );
  const listMarshalRoundForMutations = listMarshalApiRound ?? listMarshalRound;

  const anyTabNeedsMarshalHeat = useMemo(
    () => Object.values(marshalViewModeByTab).some((m) => m === "marshal" || m === "result"),
    [marshalViewModeByTab]
  );
  const anyTabInResultMode = useMemo(
    () => Object.values(marshalViewModeByTab).some((m) => m === "result"),
    [marshalViewModeByTab]
  );

  const participantPollPrimedRef = useRef(false);
  const participantPollInFlightRef = useRef(false);
  /** マーシャル draft 編集中は heat-marshal / participant-status のポーリング再取得を抑止 */
  const marshalSyncDeferredRef = useRef(false);
  const setMarshalSyncDeferred = useCallback((deferred: boolean) => {
    marshalSyncDeferredRef.current = deferred;
  }, []);

  const refreshDayOpsParticipantPoll = useCallback(async () => {
    if (!showDayOpsShell || participantPollInFlightRef.current) return;
    participantPollInFlightRef.current = true;
    try {
      await measureDayOpsAsync("day-ops participant-statuses", async () => {
        const res = await dayOpsFetch(
          `/api/competitions/${competitionId}/day-ops/participant-statuses?eventId=${encodeURIComponent(eventId)}&includeCandidates=0`
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          statuses?: ReadonlyArray<{
            participantType: string;
            competitionEntryId: string | null;
            teamEntryId: string | null;
            status: string;
            marshalRound?: ResultRound;
            updatedAt?: string;
            calledAt?: string | null;
          }>;
        };
        if (Array.isArray(data.statuses)) {
          const nextRows = data.statuses.map((s) => ({
            participantType: String(s.participantType),
            competitionEntryId: s.competitionEntryId ?? null,
            teamEntryId: s.teamEntryId ?? null,
            status: String(s.status),
            marshalRound: s.marshalRound ?? "HEAT",
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
            calledAt: s.calledAt ? new Date(s.calledAt) : null,
          }));
          setPolledParticipantStatusRows((prev) =>
            participantStatusPollRowsEqual(prev, nextRows) ? prev : nextRows
          );
        }
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      /* 遅延・一時的なネットワーク障害ではポーリングを継続 */
    } finally {
      participantPollInFlightRef.current = false;
    }
  }, [showDayOpsShell, competitionId, eventId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPolledParticipantStatusRows([...initialParticipantStatusRows]);
  }, [initialParticipantStatusRows]);

  useEffect(() => {
    participantPollPrimedRef.current = false;
  }, [eventId]);

  useEffect(() => {
    if (!showDayOpsShell) return;
    if (!participantPollPrimedRef.current && initialParticipantStatusRows.length > 0) {
      participantPollPrimedRef.current = true;
      return;
    }
    void refreshDayOpsParticipantPoll();
  }, [showDayOpsShell, eventId, refreshDayOpsParticipantPoll, initialParticipantStatusRows.length]);

  useEffect(() => {
    if (!showDayOpsShell) {
      setPolledParticipantStatusRows([...initialParticipantStatusRows]);
    }
  }, [showDayOpsShell, initialParticipantStatusRows]);

  const marshalViewStorageKeyV2 = `jla:startList:marshalView:v2:${competitionId}:${eventId}`;
  const marshalInlineStorageKeyV1 = `jla:startList:marshalInline:v1:${competitionId}:${eventId}`;

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

  const refetchResultCapture = useCallback(async () => {
    if (!showResultOps || !listMarshalRound) return;
    try {
      await measureDayOpsAsync("day-ops heat-result-capture", async () => {
        const data = await getHeatResultCapture(competitionId, eventId, listMarshalRound);
        const nextLocked = Boolean(data.lockedAt);
        setListResultLocked((prev) => (prev === nextLocked ? prev : nextLocked));
        setListResultRows((prev) =>
          resultCaptureRowsEqual(prev, data.rows) ? prev : data.rows
        );
        setListResultConfirmedHeats((prev) => {
          const merged = mergeConfirmedHeats(prev, data.confirmedHeats);
          return confirmedHeatsEqual(prev, merged) ? prev : merged;
        });
      });
    } catch {
      /* 楽観更新を維持 */
    }
  }, [showResultOps, listMarshalRound, competitionId, eventId]);

  const patchListResultHeatConfirmed = useCallback((heatIndex: number) => {
    setListResultConfirmedHeats((prev) =>
      prev.includes(heatIndex) ? prev : [...prev, heatIndex].sort((a, b) => a - b)
    );
  }, []);

  const patchListResultHeatUnconfirmed = useCallback((heatIndex: number) => {
    setListResultConfirmedHeats((prev) => prev.filter((h) => h !== heatIndex));
  }, []);

  const listResultRoundKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const roundKey =
      listMarshalRound != null ? `${eventId}:${listMarshalRound}` : null;
    if (listResultRoundKeyRef.current !== roundKey) {
      listResultRoundKeyRef.current = roundKey;
      setListResultConfirmedHeats([]);
    }
  }, [listMarshalRound, eventId]);

  useEffect(() => {
    if (!showResultOps || listMarshalRound === null || !anyTabInResultMode) {
      setListResultRows([]);
      setListResultLocked(false);
      setListResultLoading(false);
      if (!anyTabInResultMode) {
        setListResultConfirmedHeats([]);
      }
      return;
    }
    let cancelled = false;
    setListResultLoading(true);
    void getHeatResultCapture(competitionId, eventId, listMarshalRound)
      .then((data) => {
        if (cancelled) return;
        setListResultLocked(Boolean(data.lockedAt));
        setListResultRows((prev) =>
          resultCaptureRowsEqual(prev, data.rows) ? prev : data.rows
        );
        setListResultConfirmedHeats((prev) => {
          const merged = mergeConfirmedHeats(prev, data.confirmedHeats);
          return confirmedHeatsEqual(prev, merged) ? prev : merged;
        });
      })
      .catch(() => {
        /* 楽観更新済み confirmedHeats / 行データは維持（遅延 GET 失敗で確定表示が消えない） */
      })
      .finally(() => {
        if (!cancelled) setListResultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showResultOps, listMarshalRound, anyTabInResultMode, competitionId, eventId]);

  const marshalHeatFetchInFlightRef = useRef(false);
  const marshalHeatsCacheRef = useRef<Map<string, HeatMarshalHeatRow[]>>(new Map());

  useEffect(() => {
    marshalHeatsCacheRef.current.clear();
  }, [eventId]);

  const storeMarshalHeatsForRound = useCallback(
    (round: ResultRound, heats: HeatMarshalHeatRow[]) => {
      marshalHeatsCacheRef.current.set(marshalHeatsCacheKey(eventId, round), heats);
    },
    [eventId]
  );

  const fetchListMarshalHeatsCore = useCallback(
    async (signal?: AbortSignal, phase: HeatMarshalFetchPhase = "auto") => {
      if (!listMarshalRound || marshalHeatFetchInFlightRef.current) return;
      marshalHeatFetchInFlightRef.current = true;
      const round = listMarshalRound;
      const baseUrl = `/api/competitions/${competitionId}/day-ops/heat-marshal?eventId=${encodeURIComponent(eventId)}&round=${encodeURIComponent(round)}`;
      const runSummary = phase !== "full-only";

      try {
        if (runSummary) {
          await measureDayOpsAsync("day-ops heat-marshal summary", async () => {
            const res = await dayOpsFetch(`${baseUrl}&summary=1`, { signal });
            if (signal?.aborted) return;
            if (!res.ok) {
              setListMarshalHeats(null);
              setListMarshalApiRound(null);
              setListMarshalCallWindowLoading(false);
              setListMarshalParticipantsLoading(false);
              return;
            }
            const data = (await res.json()) as { heats?: HeatMarshalHeatRow[]; round?: unknown };
            const incoming = data.heats ?? [];
            setListMarshalHeats((prev) => {
              const merged = mergeMarshalHeatSummaryLayer(prev, incoming);
              storeMarshalHeatsForRound(round, merged);
              return marshalHeatsSemanticEqual(prev, merged) ? prev : merged;
            });
            setListMarshalApiRound(parseHeatMarshalResponseRound(data.round));
            setListMarshalCallWindowLoading(false);
          });
        }

        if (signal?.aborted) return;

        await measureDayOpsAsync("day-ops heat-marshal", async () => {
          const res = await dayOpsFetch(baseUrl, { signal });
          if (signal?.aborted) return;
          if (!res.ok) {
            if (runSummary) {
              setListMarshalParticipantsLoading(false);
              return;
            }
            setListMarshalHeats(null);
            setListMarshalApiRound(null);
            setListMarshalCallWindowLoading(false);
            setListMarshalParticipantsLoading(false);
            return;
          }
          const data = (await res.json()) as { heats?: HeatMarshalHeatRow[]; round?: unknown };
          const incoming = data.heats ?? [];
          setListMarshalHeats((prev) => {
            const merged = mergeListMarshalHeatsOnRefetch(prev, incoming);
            storeMarshalHeatsForRound(round, merged);
            return marshalHeatsSemanticEqual(prev, merged) ? prev : merged;
          });
          setListMarshalApiRound(parseHeatMarshalResponseRound(data.round));
          setListMarshalCallWindowLoading(false);
          setListMarshalParticipantsLoading(false);
        });
      } finally {
        marshalHeatFetchInFlightRef.current = false;
      }
    },
    [competitionId, eventId, listMarshalRound, storeMarshalHeatsForRound]
  );

  const refetchListMarshalHeats = useCallback(async () => {
    try {
      const cached = listMarshalRound
        ? marshalHeatsCacheRef.current.get(marshalHeatsCacheKey(eventId, listMarshalRound))
        : undefined;
      await fetchListMarshalHeatsCore(
        undefined,
        marshalHeatsHaveParticipants(cached) ? "full-only" : "auto"
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setListMarshalHeats(null);
      setListMarshalApiRound(null);
      setListMarshalCallWindowLoading(false);
      setListMarshalParticipantsLoading(false);
    }
  }, [fetchListMarshalHeatsCore, eventId, listMarshalRound]);

  const refreshDayOpsListsFromPoll = useCallback(
    (opts?: {
      skipMarshalHeat?: boolean;
      skipResultCapture?: boolean;
      skipParticipantPoll?: boolean;
      draftOnly?: boolean;
    }) => {
      const deferred = marshalSyncDeferredRef.current;
      const skipMarshalHeat = opts?.skipMarshalHeat || deferred;
      const skipParticipantPoll = opts?.skipParticipantPoll || deferred;
      const skipResultCapture = opts?.skipResultCapture || deferred;
      if (opts?.draftOnly) {
        if (!skipParticipantPoll) {
          void refreshDayOpsParticipantPoll();
        }
        dispatchJlaDayOpsDraftChanged(competitionId, eventId);
        return;
      }
      if (!skipParticipantPoll) {
        void refreshDayOpsParticipantPoll();
      }
      dispatchJlaDayOpsDraftChanged(competitionId, eventId);
      if (anyTabNeedsMarshalHeat && !skipMarshalHeat) {
        void refetchListMarshalHeats();
      }
      if (anyTabInResultMode && showResultOps && !skipResultCapture) {
        void refetchResultCapture();
      }
    },
    [
      refreshDayOpsParticipantPoll,
      anyTabNeedsMarshalHeat,
      anyTabInResultMode,
      refetchListMarshalHeats,
      refetchResultCapture,
      showResultOps,
      competitionId,
      eventId,
    ]
  );

  useEffect(() => {
    if (!showDayOpsShell || listMarshalRound === null || !anyTabNeedsMarshalHeat) {
      if (!anyTabNeedsMarshalHeat) {
        setListMarshalHeats(null);
        setListMarshalApiRound(null);
        setListMarshalCallWindowLoading(false);
        setListMarshalParticipantsLoading(false);
      }
      return;
    }
    const ac = new AbortController();
    const cacheKey = marshalHeatsCacheKey(eventId, listMarshalRound);
    const cached = marshalHeatsCacheRef.current.get(cacheKey);
    const cachedHasParticipants = marshalHeatsHaveParticipants(cached);

    if (cached?.length) {
      setListMarshalHeats(cached);
      setListMarshalApiRound(listMarshalRound);
      setListMarshalCallWindowLoading(false);
      setListMarshalParticipantsLoading(!cachedHasParticipants);
    } else {
      setListMarshalCallWindowLoading(true);
      setListMarshalParticipantsLoading(true);
      setListMarshalApiRound(null);
    }

    void fetchListMarshalHeatsCore(ac.signal, cachedHasParticipants ? "full-only" : "auto")
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setListMarshalHeats(null);
        setListMarshalApiRound(null);
        setListMarshalCallWindowLoading(false);
        setListMarshalParticipantsLoading(false);
      });
    return () => ac.abort();
  }, [showDayOpsShell, listMarshalRound, anyTabNeedsMarshalHeat, fetchListMarshalHeatsCore, eventId]);

  useDayOpsStartListPolling({
    enabled: showDayOpsShell,
    competitionId,
    eventId,
    dayOpsListsSyncActive: anyTabNeedsMarshalHeat,
    refreshDayOpsListsFromPoll,
  });

  const listMarshalHeatsByIndex = useMemo(() => {
    const m = new Map<number, HeatMarshalHeatRow>();
    if (!listMarshalHeats?.length) return m;
    for (const h of listMarshalHeats) {
      const n = Number(h.heatIndex);
      if (Number.isFinite(n)) m.set(n, h);
    }
    return m;
  }, [listMarshalHeats]);

  const onMarshalSuccess = useCallback(
    async (appliedOps?: ReadonlyArray<MarshalDraftOp>, options?: OnMarshalSuccessOptions) => {
      if (options?.heatCallWindowOnly && options.heatIndex != null) {
        setListMarshalHeats((prev) => {
          const next =
            prev?.length
              ? patchHeatMarshalCallWindowInHeats(prev, options.heatIndex!, options.callClosed === true)
              : prev;
          if (next?.length && listMarshalRound) {
            storeMarshalHeatsForRound(listMarshalRound, next);
          }
          return next;
        });
        dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId, {
          skipMarshalHeatRefetch: true,
          skipParticipantPoll: true,
        });
        return;
      }

      if (appliedOps?.length) {
        const patchByKey = Object.fromEntries(appliedOps.map((o) => [o.opKey, o]));
        setListMarshalHeats((prev) =>
          prev?.length ? applyMarshalDraftOpsToHeats(prev, patchByKey) : prev
        );
      }
      const skipMarshalHeatRefetch =
        Boolean(options?.heatCallWindowOnly) ||
        Boolean(appliedOps?.length && listMarshalHeats?.length);
      dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId, {
        skipMarshalHeatRefetch,
        ...(options?.localPatchOnly ? { skipParticipantPoll: true } : {}),
      });
      if (options?.localPatchOnly) {
        return;
      }
      void refreshDayOpsParticipantPoll();
      if (anyTabNeedsMarshalHeat && !skipMarshalHeatRefetch) {
        void refetchListMarshalHeats();
      }
      if (anyTabInResultMode && showResultOps) {
        void refetchResultCapture();
      }
    },
    [
      refreshDayOpsParticipantPoll,
      refetchListMarshalHeats,
      refetchResultCapture,
      competitionId,
      eventId,
      anyTabNeedsMarshalHeat,
      anyTabInResultMode,
      showResultOps,
      listMarshalHeats?.length,
      listMarshalRound,
      storeMarshalHeatsForRound,
    ]
  );

  const getViewModeForTab = useCallback(
    (tabId: string): StartListMarshalViewMode => marshalViewModeByTab[tabId] ?? "normal",
    [marshalViewModeByTab]
  );

  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    showDayOpsShell,
    polledParticipantStatusRows,
    marshalViewModeByTab,
    persistMarshalViewMode,
    getViewModeForTab,
    listMarshalHeats,
    listMarshalHeatsByIndex,
    listMarshalCallWindowLoading,
    listMarshalParticipantsLoading,
    listMarshalRound,
    listMarshalRoundForMutations,
    marshalRoundMismatch,
    listResultRows,
    listResultLocked,
    listResultLoading,
    listResultConfirmedHeats,
    refetchResultCapture,
    patchListResultHeatConfirmed,
    patchListResultHeatUnconfirmed,
    onMarshalSuccess,
    setMarshalSyncDeferred,
  };
}
