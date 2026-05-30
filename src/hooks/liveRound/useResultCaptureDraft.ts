"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeatMarshalParticipant } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";
import {
  postHeatResultCaptureAppend,
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
import { participantKeyFromResultRow } from "@/components/startListRoundList/panelHelpers";
import {
  countResultDraftsForHeatFromOps,
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
  const [heatResultConfirmBusy, setHeatResultConfirmBusy] = useState(false);
  const [runUpTarget, setRunUpTarget] = useState<number | null>(null);
  const [clearRunUpTarget, setClearRunUpTarget] = useState<number | null>(null);
  const [runUpBusy, setRunUpBusy] = useState(false);

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
    [eventId, mRef]
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

  const runHeatResultRunUp = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setRunUpBusy(true);
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
        setRunUpBusy(false);
      }
    },
    [m, resultCapture, eventId]
  );

  const runHeatResultClearRunUp = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setRunUpBusy(true);
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
        setRunUpBusy(false);
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

  /** 確定直前: 当該ヒートの未確定チェックをサーバーへ送る。失敗時は false */
  const flushResultDraftsBeforeConfirm = useCallback(
    async (displayHeatNumber: number): Promise<boolean> => {
      if (!m) return false;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[displayHeatNumber]);
      delete timers[displayHeatNumber];

      const draftsForHeat = Object.values(resultDraftOpsRef.current)
        .filter((op) => op.heatIndex === displayHeatNumber)
        .sort((a, b) => (a.draftSequence ?? 0) - (b.draftSequence ?? 0));
      if (draftsForHeat.length === 0) return true;

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
            teamMemberUserId: op.participantType === "TEAM" ? op.teamMemberUserId : undefined,
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
        return false;
      }
      clearResultDraftsForHeat(displayHeatNumber);
      return true;
    },
    [m, eventId, handleRankRecorded, clearResultDraftsForHeat]
  );

  const runHeatResultConfirm = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setHeatResultConfirmBusy(true);
      try {
        const draftsFlushed = await flushResultDraftsBeforeConfirm(displayHeatNumber);
        if (!draftsFlushed) return;

        patchResultHeatConfirmed(displayHeatNumber);
        setHeatResultConfirmTarget(null);

        await postHeatResultConfirmHeat(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
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
        toast.error(e instanceof Error ? e.message : "確定に失敗しました");
      } finally {
        setHeatResultConfirmBusy(false);
      }
    },
    [
      m,
      resultCapture,
      eventId,
      flushResultDraftsBeforeConfirm,
      patchResultHeatConfirmed,
      patchResultHeatUnconfirmed,
      clearResultDraftsForHeat,
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
    heatResultConfirmBusy,
    runUpTarget,
    setRunUpTarget,
    clearRunUpTarget,
    setClearRunUpTarget,
    runUpBusy,
    runHeatResultRunUp,
    runHeatResultClearRunUp,
    handleRankRecorded,
    countResultDraftsForHeat,
    toggleResultDraft,
    rankedParticipantKeysForHeat,
    applyRankOrderLocally,
    reorderResultRanks,
    runHeatResultConfirm,
  };
}
