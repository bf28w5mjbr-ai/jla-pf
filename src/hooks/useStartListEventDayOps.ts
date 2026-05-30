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
  patchHeatMarshalCallWindowInHeats,
} from "@/components/startListRoundList/panelHelpers";
import type { MarshalDraftOp, OnMarshalSuccessOptions } from "@/hooks/liveRound/types";
import { useDayOpsStartListPolling } from "@/hooks/useDayOpsStartListPolling";
import { dispatchJlaDayOpsParticipantStatusChanged } from "@/lib/dayOpsParticipantStatusDisplay";
import { measureDayOpsAsync } from "@/lib/dayOpsMetrics";

type Args = {
  competitionId: string;
  eventId: string;
  showMarshalOps: boolean;
  showResultOps: boolean;
  initialParticipantStatusRows: ReadonlyArray<StartListEventParticipantStatusRow>;
  activeTabIndex: number;
  tabCount: number;
};

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
  const [listMarshalLoading, setListMarshalLoading] = useState(false);
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

  const refreshDayOpsParticipantPoll = useCallback(async () => {
    if (!showDayOpsShell) return;
    await measureDayOpsAsync("day-ops participant-statuses", async () => {
      const res = await fetch(
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
        setPolledParticipantStatusRows(
          data.statuses.map((s) => ({
            participantType: String(s.participantType),
            competitionEntryId: s.competitionEntryId ?? null,
            teamEntryId: s.teamEntryId ?? null,
            status: String(s.status),
            marshalRound: s.marshalRound ?? "HEAT",
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
            calledAt: s.calledAt ? new Date(s.calledAt) : null,
          }))
        );
      }
    });
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
        setListResultLocked(Boolean(data.lockedAt));
        setListResultRows(data.rows);
        setListResultConfirmedHeats(data.confirmedHeats);
      });
    } catch {
      /* 楽観更新を維持 */
    }
  }, [showResultOps, listMarshalRound, competitionId, eventId]);

  useEffect(() => {
    if (!showResultOps || listMarshalRound === null || !anyTabInResultMode) {
      setListResultRows([]);
      setListResultLocked(false);
      setListResultLoading(false);
      setListResultConfirmedHeats([]);
      return;
    }
    let cancelled = false;
    setListResultLoading(true);
    void getHeatResultCapture(competitionId, eventId, listMarshalRound)
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
  }, [showResultOps, listMarshalRound, anyTabInResultMode, competitionId, eventId]);

  const marshalHeatFetchInFlightRef = useRef(false);

  const fetchListMarshalHeatsCore = useCallback(
    async (signal?: AbortSignal) => {
      if (!listMarshalRound || marshalHeatFetchInFlightRef.current) return;
      marshalHeatFetchInFlightRef.current = true;
      try {
        await measureDayOpsAsync("day-ops heat-marshal", async () => {
          const res = await fetch(
            `/api/competitions/${competitionId}/day-ops/heat-marshal?eventId=${encodeURIComponent(eventId)}&round=${encodeURIComponent(listMarshalRound)}`,
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
      } finally {
        marshalHeatFetchInFlightRef.current = false;
      }
    },
    [competitionId, eventId, listMarshalRound]
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

  const refreshMarshalAndResultLists = useCallback(
    (opts?: { skipMarshalHeat?: boolean }) => {
      if (anyTabNeedsMarshalHeat && !opts?.skipMarshalHeat) {
        void refetchListMarshalHeats();
      }
      if (anyTabInResultMode && showResultOps) {
        void refetchResultCapture();
      }
    },
    [
      anyTabNeedsMarshalHeat,
      anyTabInResultMode,
      refetchListMarshalHeats,
      refetchResultCapture,
      showResultOps,
    ]
  );

  useEffect(() => {
    if (!showDayOpsShell || listMarshalRound === null || !anyTabNeedsMarshalHeat) {
      if (!anyTabNeedsMarshalHeat) {
        setListMarshalHeats(null);
        setListMarshalApiRound(null);
        setListMarshalLoading(false);
      }
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
  }, [showDayOpsShell, listMarshalRound, anyTabNeedsMarshalHeat, fetchListMarshalHeatsCore]);

  useDayOpsStartListPolling({
    enabled: showDayOpsShell,
    competitionId,
    eventId,
    dayOpsListsSyncActive: anyTabNeedsMarshalHeat,
    refreshParticipantStatuses: refreshDayOpsParticipantPoll,
    refreshMarshalAndResultLists,
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
        setListMarshalHeats((prev) =>
          prev?.length
            ? patchHeatMarshalCallWindowInHeats(prev, options.heatIndex!, options.callClosed === true)
            : prev
        );
        dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId, {
          skipMarshalHeatRefetch: true,
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
      });
      const refetches: Promise<void>[] = [refreshDayOpsParticipantPoll()];
      if (anyTabNeedsMarshalHeat && !skipMarshalHeatRefetch) {
        refetches.push(refetchListMarshalHeats());
      }
      if (anyTabInResultMode && showResultOps) {
        refetches.push(refetchResultCapture());
      }
      await Promise.all(refetches);
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
    listMarshalLoading,
    listMarshalRound,
    listMarshalRoundForMutations,
    marshalRoundMismatch,
    listResultRows,
    listResultLocked,
    listResultLoading,
    listResultConfirmedHeats,
    refetchResultCapture,
    onMarshalSuccess,
  };
}
