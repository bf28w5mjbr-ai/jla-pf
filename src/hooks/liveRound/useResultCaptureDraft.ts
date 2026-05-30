"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  postHeatResultClearRunUp,
  postHeatResultConfirmHeat,
  postHeatResultReorder,
  postHeatResultRunUp,
} from "@/lib/heatResultCaptureApi";
import { toast } from "sonner";
import {
  deleteHeatOperationDraftFireAndForget,
  getHeatOperationDraft,
  isDayOpsResultDraftServerSyncEnabled,
  parseServerResultDraftPayload,
  patchHeatOperationDraftResultPayloadFireAndForget,
  type HeatResultDraftServerEntry,
} from "@/lib/dayOpsHeatOperationDraftSync";
import { dispatchJlaDayOpsParticipantStatusChanged } from "@/lib/dayOpsParticipantStatusDisplay";
import { resultCaptureRowsEqual, mergeConfirmedHeats, confirmedHeatsEqual } from "@/lib/dayOpsPollCompare";
import { participantKeyFromResultRow } from "@/components/startListRoundList/panelHelpers";
import {
  countResultDraftsForHeatFromOps,
  rankOrderKeysForHeat,
  rankedParticipantKeysForHeatFromRows,
} from "@/hooks/liveRound/resultCaptureDraftHelpers";
import type { LiveRoundMarshalContext, ResultDraftOp } from "@/hooks/liveRound/types";
import type { RefObject } from "react";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";

type ResultCaptureSlice = NonNullable<LiveRoundMarshalContext>["resultCapture"];

export function useResultCaptureDraft(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  mRef: RefObject<LiveRoundMarshalContext>;
  resultCaptureVisible: boolean;
  resultCapture: ResultCaptureSlice | undefined;
  heatsRef: RefObject<HeatMarshalHeatRow[]>;
}) {
  const { eventId, m, mRef, resultCaptureVisible, resultCapture, heatsRef } = args;

  const [localResultRows, setLocalResultRows] = useState<HeatResultCaptureRow[]>([]);
  const [resultCapturePendingKey, setResultCapturePendingKey] = useState<string | null>(null);
  const [resultDraftOps, setResultDraftOps] = useState<Record<string, ResultDraftOp>>({});
  const [resultDraftErrors, setResultDraftErrors] = useState<Record<string, string>>({});
  const [tieNextHeatIndex, setTieNextHeatIndex] = useState<number | null>(null);
  const [localConfirmedHeats, setLocalConfirmedHeats] = useState<number[]>([]);
  const [resultInputOrder, setResultInputOrder] = useState<"asc" | "desc">("asc");
  const [dragSourceParticipantKey, setDragSourceParticipantKey] = useState<string | null>(null);
  const [dragOverParticipantKey, setDragOverParticipantKey] = useState<string | null>(null);
  const [heatResultConfirmTarget, setHeatResultConfirmTarget] = useState<number | null>(null);
  const [heatResultConfirmBusyHeat, setHeatResultConfirmBusyHeat] = useState<number | null>(null);
  const [runUpTarget, setRunUpTarget] = useState<number | null>(null);
  const [clearRunUpTarget, setClearRunUpTarget] = useState<number | null>(null);
  const [runUpBusyHeat, setRunUpBusyHeat] = useState<number | null>(null);

  const tieNextHeatIndexRef = useRef<number | null>(null);
  useEffect(() => {
    tieNextHeatIndexRef.current = tieNextHeatIndex;
  }, [tieNextHeatIndex]);
  const confirmedHeatsRef = useRef<number[]>([]);
  confirmedHeatsRef.current = localConfirmedHeats;
  const resultDraftOpsRef = useRef(resultDraftOps);
  resultDraftOpsRef.current = resultDraftOps;
  const resultDraftPatchTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastLocalResultDraftTouchRef = useRef(0);
  const resultDraftSequenceRef = useRef(0);

  useEffect(() => {
    const next = resultCapture?.rows ?? [];
    setLocalResultRows((prev) => (resultCaptureRowsEqual(prev, next) ? prev : next));
  }, [resultCapture?.rows]);

  useEffect(() => {
    if (!resultCaptureVisible) {
      setTieNextHeatIndex(null);
    }
  }, [resultCaptureVisible]);

  const confirmedHeatsKey = JSON.stringify(resultCapture?.confirmedHeats ?? []);
  useEffect(() => {
    setLocalConfirmedHeats((prev) => {
      const server = resultCapture?.confirmedHeats ?? [];
      const merged = mergeConfirmedHeats(prev, server);
      return confirmedHeatsEqual(prev, merged) ? prev : merged;
    });
  }, [confirmedHeatsKey, resultCapture?.confirmedHeats]);

  const flushResultDraftServerPatch = useCallback(
    (heatIndex: number) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      delete timers[heatIndex];
      const mm = mRef.current;
      if (!mm?.competitionId) return;
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
    },
    [eventId, mRef]
  );

  const scheduleResultDraftServerPatch = useCallback(
    (heatIndex: number) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      timers[heatIndex] = setTimeout(() => {
        lastLocalResultDraftTouchRef.current = Date.now();
        flushResultDraftServerPatch(heatIndex);
      }, 480);
    },
    [flushResultDraftServerPatch]
  );

  useEffect(() => {
    return () => {
      const timers = resultDraftPatchTimersRef.current;
      const pendingHeats = Object.keys(timers).map((k) => Number(k));
      for (const t of Object.values(timers)) clearTimeout(t);
      resultDraftPatchTimersRef.current = {};
      const heatsToFlush = new Set<number>(pendingHeats);
      for (const op of Object.values(resultDraftOpsRef.current)) {
        heatsToFlush.add(op.heatIndex);
      }
      for (const hi of heatsToFlush) {
        if (Number.isFinite(hi)) flushResultDraftServerPatch(hi);
      }
    };
  }, [flushResultDraftServerPatch]);

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
                next[k] = v as ResultDraftOp;
              }
            }
            return next;
          });
        } catch {
          // ignore per-heat errors
        }
      }
    })();
  }, [eventId, mRef, heatsRef]);

  useEffect(() => {
    if (!resultCaptureVisible || !isDayOpsResultDraftServerSyncEnabled()) return;
    pullResultDraftsFromServer();
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
    (heatIndex: number) => countResultDraftsForHeatFromOps(resultDraftOps, heatIndex),
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
    (heatIndex: number): string[] => rankedParticipantKeysForHeatFromRows(localResultRows, heatIndex),
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

  const reorderResultDrafts = useCallback(
    (heatIndex: number, sourceKey: string, targetKey: string) => {
      setResultDraftOps((prev) => {
        const keys = Object.entries(prev)
          .filter(([, op]) => op.heatIndex === heatIndex)
          .sort(
            (a, b) =>
              (a[1].draftSequence ?? 0) - (b[1].draftSequence ?? 0) ||
              a[0].localeCompare(b[0])
          )
          .map(([k]) => k);
        const from = keys.indexOf(sourceKey);
        const to = keys.indexOf(targetKey);
        if (from < 0 || to < 0 || from === to) return prev;
        const nextKeys = [...keys];
        const [moved] = nextKeys.splice(from, 1);
        nextKeys.splice(to, 0, moved!);
        const next = { ...prev };
        nextKeys.forEach((key, idx) => {
          const op = next[key];
          if (op) next[key] = { ...op, draftSequence: idx + 1 };
        });
        return next;
      });
      lastLocalResultDraftTouchRef.current = Date.now();
      scheduleResultDraftServerPatch(heatIndex);
    },
    [scheduleResultDraftServerPatch]
  );

  const reorderResultOrder = useCallback(
    async (heatIndex: number, sourceKey: string, targetKey: string) => {
      if (rankedParticipantKeysForHeat(heatIndex).length > 0) {
        await reorderResultRanks(heatIndex, sourceKey, targetKey);
        return;
      }
      reorderResultDrafts(heatIndex, sourceKey, targetKey);
    },
    [rankedParticipantKeysForHeat, reorderResultRanks, reorderResultDrafts]
  );

  const rankOrderKeysForHeatIndex = useCallback(
    (heatIndex: number) =>
      rankOrderKeysForHeat(localResultRows, heatIndex, resultDraftOps),
    [localResultRows, resultDraftOps]
  );

  const runHeatResultRunUp = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setRunUpBusyHeat(displayHeatNumber);
      try {
        const { createdCount } = await postHeatResultRunUp(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
        setRunUpTarget(null);
        void resultCapture.onRefetch();
        toast.success(`ランアップ ${createdCount} 名を登録しました`);
        dispatchJlaDayOpsParticipantStatusChanged(m.competitionId, eventId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ランアップの登録に失敗しました");
      } finally {
        setRunUpBusyHeat((prev) => (prev === displayHeatNumber ? null : prev));
      }
    },
    [m, resultCapture, eventId]
  );

  const runHeatResultClearRunUp = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setRunUpBusyHeat(displayHeatNumber);
      try {
        const { deletedCount } = await postHeatResultClearRunUp(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
        setClearRunUpTarget(null);
        void resultCapture.onRefetch();
        toast.success(`ランアップ ${deletedCount} 名を解除しました`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ランアップの解除に失敗しました");
      } finally {
        setRunUpBusyHeat((prev) => (prev === displayHeatNumber ? null : prev));
      }
    },
    [m, resultCapture, eventId]
  );

  const patchResultHeatConfirmed = useCallback(
    (heatIndex: number) => {
      setLocalConfirmedHeats((prev) =>
        prev.includes(heatIndex) ? prev : [...prev, heatIndex].sort((a, b) => a - b)
      );
      resultCapture?.patchHeatConfirmed(heatIndex);
    },
    [resultCapture]
  );

  const patchResultHeatUnconfirmed = useCallback(
    (heatIndex: number) => {
      setLocalConfirmedHeats((prev) => prev.filter((h) => h !== heatIndex));
      resultCapture?.patchHeatUnconfirmed(heatIndex);
    },
    [resultCapture]
  );

  const clearResultDraftsForHeat = useCallback((heatIndex: number) => {
    const timers = resultDraftPatchTimersRef.current;
    clearTimeout(timers[heatIndex]);
    delete timers[heatIndex];
    setResultDraftOps((prev) => {
      const next: typeof prev = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v.heatIndex !== heatIndex) next[k] = v;
      }
      return next;
    });
    setResultDraftErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        const op = resultDraftOpsRef.current[k];
        if (op?.heatIndex === heatIndex) delete next[k];
      }
      return next;
    });
  }, []);

  const runHeatResultConfirm = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setHeatResultConfirmBusyHeat(displayHeatNumber);

      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[displayHeatNumber]);
      delete timers[displayHeatNumber];

      const draftsForHeat = Object.values(resultDraftOpsRef.current)
        .filter((op) => op.heatIndex === displayHeatNumber)
        .sort((a, b) => (a.draftSequence ?? 0) - (b.draftSequence ?? 0));
      const rankedKeys = new Set(
        rankedParticipantKeysForHeatFromRows(localResultRows, displayHeatNumber)
      );
      const draftsToFlush = draftsForHeat.filter((op) => !rankedKeys.has(op.opKey));
      const manualEntries = draftsToFlush.map((op) => ({
        participantType: op.participantType,
        competitionEntryId:
          op.participantType === "INDIVIDUAL" ? op.competitionEntryId : undefined,
        teamEntryId: op.participantType === "TEAM" ? op.teamEntryId : undefined,
        teamMemberUserId: op.participantType === "TEAM" ? op.teamMemberUserId : undefined,
        tieWithPrevious: op.tieWithPrevious,
        inputOrder: op.inputOrder,
      }));

      patchResultHeatConfirmed(displayHeatNumber);
      setHeatResultConfirmTarget(null);

      try {
        const { appended } = await postHeatResultConfirmHeat(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
          ...(manualEntries.length > 0 ? { manualEntries } : {}),
        });
        for (const row of appended) {
          handleRankRecorded({
            heatIndex: displayHeatNumber,
            lane: row.lane,
            rank: row.rank,
            participantType: row.participantType,
            competitionEntryId: row.competitionEntryId,
            teamEntryId: row.teamEntryId,
          });
        }
        clearResultDraftsForHeat(displayHeatNumber);
        toast.success(`ヒート ${displayHeatNumber} のリザルトを確定しました`);
        dispatchJlaDayOpsParticipantStatusChanged(m.competitionId, eventId, {
          skipResultCaptureRefetch: true,
          skipParticipantPoll: true,
        });
        deleteHeatOperationDraftFireAndForget(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
      } catch (e) {
        patchResultHeatUnconfirmed(displayHeatNumber);
        const message = e instanceof Error ? e.message : "確定に失敗しました";
        if (draftsToFlush.length > 0) {
          setResultDraftErrors((prev) => {
            const next = { ...prev };
            for (const op of draftsToFlush) {
              next[op.opKey] = message;
            }
            return next;
          });
        }
        toast.error(message);
      } finally {
        setHeatResultConfirmBusyHeat((prev) => (prev === displayHeatNumber ? null : prev));
      }
    },
    [
      m,
      resultCapture,
      eventId,
      handleRankRecorded,
      patchResultHeatConfirmed,
      patchResultHeatUnconfirmed,
      clearResultDraftsForHeat,
      localResultRows,
    ]
  );

  return {
    localResultRows,
    resultCapturePendingKey,
    setResultCapturePendingKey,
    resultDraftOps,
    setResultDraftOps,
    resultDraftErrors,
    setResultDraftErrors,
    tieNextHeatIndex,
    setTieNextHeatIndex,
    tieNextHeatIndexRef,
    localConfirmedHeats,
    confirmedHeatsRef,
    resultInputOrder,
    setResultInputOrder,
    dragSourceParticipantKey,
    setDragSourceParticipantKey,
    dragOverParticipantKey,
    setDragOverParticipantKey,
    heatResultConfirmTarget,
    setHeatResultConfirmTarget,
    heatResultConfirmBusyHeat,
    runUpTarget,
    setRunUpTarget,
    clearRunUpTarget,
    setClearRunUpTarget,
    runUpBusyHeat,
    runHeatResultRunUp,
    runHeatResultClearRunUp,
    handleRankRecorded,
    countResultDraftsForHeat,
    toggleResultDraft,
    rankedParticipantKeysForHeat,
    rankOrderKeysForHeatIndex,
    applyRankOrderLocally,
    reorderResultRanks,
    reorderResultOrder,
    runHeatResultConfirm,
  };
}
