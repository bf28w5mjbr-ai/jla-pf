"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  JLA_DAY_OPS_DRAFT_CHANGED,
  parseServerResultDraftPayload,
  patchHeatOperationDraftResultPayload,
  patchHeatOperationDraftResultPayloadFireAndForget,
  type HeatResultDraftServerEntry,
} from "@/lib/dayOpsHeatOperationDraftSync";
import { dispatchJlaDayOpsParticipantStatusChanged } from "@/lib/dayOpsParticipantStatusDisplay";
import { resultCaptureRowsEqual, mergeConfirmedHeats, confirmedHeatsEqual } from "@/lib/dayOpsPollCompare";
import { participantKeyFromResultRow } from "@/components/startListRoundList/panelHelpers";
import {
  countResultDraftsForHeatFromOps,
  draftsPendingAppendForHeat,
  rankOrderKeysForHeat,
  rankedParticipantKeysForHeatFromRows,
} from "@/hooks/liveRound/resultCaptureDraftHelpers";
import type { ResultRound } from "@prisma/client";
import type { LiveRoundMarshalContext, ResultDraftOp } from "@/hooks/liveRound/types";
import type { RefObject } from "react";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";

type ResultCaptureSlice = NonNullable<LiveRoundMarshalContext>["resultCapture"];

type ResultDraftSyncContext = {
  competitionId: string;
  round: ResultRound;
};

/** PATCH 完了前にサーバー pull でローカルチェックが消えるのを防ぐ */
const RESULT_DRAFT_LOCAL_SYNC_GUARD_MS = 20_000;
const RESULT_DRAFT_DEBOUNCE_MS = 200;

export function useResultCaptureDraft(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  resultDraftSyncContext: ResultDraftSyncContext | null;
  resultCaptureVisible: boolean;
  /** リザルトモード（非アクティブタブ含む）で下書き PATCH を継続 */
  resultDraftSyncActive: boolean;
  resultCapture: ResultCaptureSlice | undefined;
  heatsRef: RefObject<HeatMarshalHeatRow[]>;
}) {
  const {
    eventId,
    m,
    resultDraftSyncContext,
    resultCaptureVisible,
    resultDraftSyncActive,
    resultCapture,
    heatsRef,
  } = args;

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
  const heatResultConfirmBusyHeatRef = useRef<number | null>(null);
  const resultDraftSequenceRef = useRef(0);
  const router = useRouter();
  const resultDraftSyncContextRef = useRef(resultDraftSyncContext);
  const mRef = useRef(m);
  const resultCaptureRef = useRef(resultCapture);
  const localResultRowsRef = useRef(localResultRows);
  useEffect(() => {
    if (resultDraftSyncContext) {
      resultDraftSyncContextRef.current = resultDraftSyncContext;
    }
  }, [resultDraftSyncContext]);
  useEffect(() => {
    mRef.current = m;
    resultCaptureRef.current = resultCapture;
  }, [m, resultCapture]);
  localResultRowsRef.current = localResultRows;

  useEffect(() => {
    heatResultConfirmBusyHeatRef.current = heatResultConfirmBusyHeat;
  }, [heatResultConfirmBusyHeat]);

  const buildResultDraftServerEntriesForHeat = useCallback((heatIndex: number) => {
    const entries: Record<string, HeatResultDraftServerEntry> = {};
    for (const op of Object.values(resultDraftOpsRef.current)) {
      if (op.heatIndex === heatIndex) {
        entries[op.opKey] = op as HeatResultDraftServerEntry;
      }
    }
    return entries;
  }, []);

  const awaitResultDraftServerPatch = useCallback(
    async (heatIndex: number) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      delete timers[heatIndex];
      const syncCtx = resultDraftSyncContextRef.current;
      if (!syncCtx?.competitionId) return;
      const entries = buildResultDraftServerEntriesForHeat(heatIndex);
      try {
        await patchHeatOperationDraftResultPayload(syncCtx.competitionId, {
          eventId,
          round: syncCtx.round,
          heatIndex,
          entries,
        });
      } catch {
        // 確定 API が manualEntries を送るため、PATCH 失敗でも続行
      }
    },
    [buildResultDraftServerEntriesForHeat, eventId]
  );

  const flushResultDraftServerPatch = useCallback(
    (heatIndex: number, options?: { keepalive?: boolean }) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      delete timers[heatIndex];
      const syncCtx = resultDraftSyncContextRef.current;
      if (!syncCtx?.competitionId) return;
      const entries = buildResultDraftServerEntriesForHeat(heatIndex);
      patchHeatOperationDraftResultPayloadFireAndForget(
        syncCtx.competitionId,
        {
          eventId,
          round: syncCtx.round,
          heatIndex,
          entries,
        },
        options
      );
    },
    [buildResultDraftServerEntriesForHeat, eventId]
  );

  const flushAllResultDraftServerPatches = useCallback(
    (options?: { keepalive?: boolean }) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      const timers = resultDraftPatchTimersRef.current;
      for (const t of Object.values(timers)) clearTimeout(t);
      resultDraftPatchTimersRef.current = {};
      const heatsToFlush = new Set<number>();
      for (const op of Object.values(resultDraftOpsRef.current)) {
        heatsToFlush.add(op.heatIndex);
      }
      for (const hi of heatsToFlush) {
        if (Number.isFinite(hi)) flushResultDraftServerPatch(hi, options);
      }
    },
    [flushResultDraftServerPatch]
  );

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

  const scheduleResultDraftServerPatch = useCallback(
    (heatIndex: number) => {
      if (!isDayOpsResultDraftServerSyncEnabled()) return;
      if (!resultDraftSyncActive) return;
      if (heatResultConfirmBusyHeatRef.current !== null) return;
      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[heatIndex]);
      timers[heatIndex] = setTimeout(() => {
        lastLocalResultDraftTouchRef.current = Date.now();
        flushResultDraftServerPatch(heatIndex);
      }, RESULT_DRAFT_DEBOUNCE_MS);
    },
    [flushResultDraftServerPatch, resultDraftSyncActive]
  );

  useEffect(() => {
    return () => {
      if (heatResultConfirmBusyHeatRef.current !== null) {
        flushAllResultDraftServerPatches({ keepalive: true });
        return;
      }
      void (async () => {
        const heats = new Set(
          Object.values(resultDraftOpsRef.current).map((o) => o.heatIndex)
        );
        for (const hi of heats) {
          if (Number.isFinite(hi)) await awaitResultDraftServerPatch(hi);
        }
      })();
      flushAllResultDraftServerPatches({ keepalive: true });
    };
  }, [flushAllResultDraftServerPatches, awaitResultDraftServerPatch]);

  useEffect(() => {
    if (!isDayOpsResultDraftServerSyncEnabled()) return;
    const onPageHide = () => {
      flushAllResultDraftServerPatches({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushAllResultDraftServerPatches]);

  const pullResultDraftsFromServer = useCallback(() => {
    if (!isDayOpsResultDraftServerSyncEnabled()) return;
    if (!resultDraftSyncActive) return;
    if (heatResultConfirmBusyHeatRef.current !== null) return;
    if (Date.now() - lastLocalResultDraftTouchRef.current < RESULT_DRAFT_LOCAL_SYNC_GUARD_MS) {
      return;
    }
    const syncCtx = resultDraftSyncContextRef.current;
    if (!syncCtx?.competitionId) return;

    void (async () => {
      for (const h of heatsRef.current) {
        const hi = Number(h.heatIndex);
        if (!Number.isFinite(hi) || !h.callClosedAt) continue;
        if (confirmedHeatsRef.current.includes(hi)) continue;
        try {
          const row = await getHeatOperationDraft(syncCtx.competitionId, {
            eventId,
            round: syncCtx.round,
            heatIndex: hi,
          });
          if (!row.updatedAt) continue;
          const serverUpdatedMs = Date.parse(row.updatedAt);
          if (!Number.isFinite(serverUpdatedMs)) continue;
          if (serverUpdatedMs <= lastLocalResultDraftTouchRef.current) continue;
          const entries = parseServerResultDraftPayload(row.resultDraftPayload);
          if (!entries) continue;
          const entryKeys = Object.keys(entries);
          if (entryKeys.length === 0) {
            const hasLocalForHeat = Object.values(resultDraftOpsRef.current).some(
              (op) => op.heatIndex === hi
            );
            if (hasLocalForHeat) continue;
          }

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
            resultDraftOpsRef.current = next;
            return next;
          });
        } catch {
          // ignore per-heat errors
        }
      }
    })();
  }, [eventId, heatsRef, resultDraftSyncActive]);

  useEffect(() => {
    if (!resultDraftSyncActive || !isDayOpsResultDraftServerSyncEnabled()) return;
    pullResultDraftsFromServer();
  }, [resultDraftSyncActive, pullResultDraftsFromServer]);

  useEffect(() => {
    if (resultDraftSyncActive || !isDayOpsResultDraftServerSyncEnabled()) return;
    flushAllResultDraftServerPatches();
  }, [resultDraftSyncActive, flushAllResultDraftServerPatches]);

  useEffect(() => {
    if (!isDayOpsResultDraftServerSyncEnabled() || !resultDraftSyncActive) return;
    const onVis = () => {
      if (document.visibilityState === "visible") pullResultDraftsFromServer();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [resultDraftSyncActive, pullResultDraftsFromServer]);

  useEffect(() => {
    if (!resultDraftSyncActive || !resultDraftSyncContext) return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ competitionId?: string; eventId?: string }>).detail;
      if (
        d?.competitionId === resultDraftSyncContext.competitionId &&
        d?.eventId === eventId
      ) {
        pullResultDraftsFromServer();
      }
    };
    window.addEventListener(JLA_DAY_OPS_DRAFT_CHANGED, handler);
    return () => window.removeEventListener(JLA_DAY_OPS_DRAFT_CHANGED, handler);
  }, [resultDraftSyncActive, resultDraftSyncContext, eventId, pullResultDraftsFromServer]);

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
        let next: Record<string, ResultDraftOp>;
        if (!checked) {
          if (!prev[opKey]) return prev;
          next = { ...prev };
          delete next[opKey];
        } else {
          next = {
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
        }
        resultDraftOpsRef.current = next;
        return next;
      });
      lastLocalResultDraftTouchRef.current = Date.now();
      scheduleResultDraftServerPatch(heatIndex);
      flushResultDraftServerPatch(heatIndex);
    },
    [scheduleResultDraftServerPatch, flushResultDraftServerPatch]
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
        resultDraftOpsRef.current = next;
        return next;
      });
      lastLocalResultDraftTouchRef.current = Date.now();
      scheduleResultDraftServerPatch(heatIndex);
      flushResultDraftServerPatch(heatIndex);
    },
    [scheduleResultDraftServerPatch, flushResultDraftServerPatch]
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

  /** ランアップ前: 未確定チェックを append API で公式行へ反映（confirm の一括 append とは別経路） */
  const flushResultDraftsViaAppend = useCallback(
    async (displayHeatNumber: number): Promise<boolean> => {
      if (!m) return false;
      const pending = draftsPendingAppendForHeat(
        resultDraftOpsRef.current,
        displayHeatNumber,
        localResultRowsRef.current
      );
      if (pending.length === 0) return true;

      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[displayHeatNumber]);
      delete timers[displayHeatNumber];
      await awaitResultDraftServerPatch(displayHeatNumber);

      const failedMap: Record<string, string> = {};
      let successCount = 0;
      for (const op of pending) {
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
        const next = { ...prev };
        for (const op of pending) {
          if (!failedKeys.has(op.opKey)) delete next[op.opKey];
        }
        resultDraftOpsRef.current = next;
        return next;
      });
      if (failedKeys.size > 0) {
        if (successCount > 0) {
          toast.error(
            `未確定チェック ${failedKeys.size}件の反映に失敗したため、ランアップを中止しました`
          );
        } else {
          toast.error("未確定チェックの反映に失敗したため、ランアップを中止しました");
        }
        return false;
      }
      return true;
    },
    [m, eventId, handleRankRecorded, awaitResultDraftServerPatch]
  );

  const runHeatResultRunUp = useCallback(
    async (displayHeatNumber: number) => {
      if (!m || !resultCapture) return;
      setRunUpBusyHeat(displayHeatNumber);
      try {
        const flushed = await flushResultDraftsViaAppend(displayHeatNumber);
        if (!flushed) return;
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
    [m, resultCapture, eventId, flushResultDraftsViaAppend]
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
      const marshal = mRef.current;
      const capture = resultCaptureRef.current;
      if (!marshal || !capture) {
        toast.error("リザルト状態を読み込めません。ページを更新してください。");
        return;
      }
      setHeatResultConfirmBusyHeat(displayHeatNumber);
      setHeatResultConfirmTarget(null);

      const timers = resultDraftPatchTimersRef.current;
      clearTimeout(timers[displayHeatNumber]);
      delete timers[displayHeatNumber];

      const draftsToFlush = draftsPendingAppendForHeat(
        resultDraftOpsRef.current,
        displayHeatNumber,
        localResultRowsRef.current
      );
      const manualEntries = draftsToFlush.map((op) => ({
        participantType: op.participantType,
        competitionEntryId:
          op.participantType === "INDIVIDUAL" ? op.competitionEntryId : undefined,
        teamEntryId: op.participantType === "TEAM" ? op.teamEntryId : undefined,
        teamMemberUserId: op.participantType === "TEAM" ? op.teamMemberUserId : undefined,
        tieWithPrevious: op.tieWithPrevious,
        inputOrder: op.inputOrder,
      }));

      if (draftsToFlush.length > 0) {
        await awaitResultDraftServerPatch(displayHeatNumber);
      }

      patchResultHeatConfirmed(displayHeatNumber);

      const isRetryableConfirmError = (e: unknown): boolean => {
        if (!(e instanceof Error)) return false;
        const msg = e.message;
        return (
          msg.includes("混み合") ||
          msg.includes("データベース") ||
          msg.includes("Failed to fetch") ||
          /network/i.test(msg)
        );
      };

      let confirmError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        try {
          const { appended, startListAppend } = await postHeatResultConfirmHeat(marshal.competitionId, {
            eventId,
            round: marshal.round,
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
          if (startListAppend?.ok && !startListAppend.skipped) {
            const roundLabel = startListAppend.toRound === "FINAL" ? "決勝" : "準決勝";
            toast.success(
              `${roundLabel}のスタートリストを自動生成しました（${startListAppend.participantCount}名・${startListAppend.heatCount}ヒート）`
            );
            router.refresh();
          }
          dispatchJlaDayOpsParticipantStatusChanged(marshal.competitionId, eventId, {
            skipResultCaptureRefetch: true,
            skipParticipantPoll: true,
          });
          deleteHeatOperationDraftFireAndForget(marshal.competitionId, {
            eventId,
            round: marshal.round,
            heatIndex: displayHeatNumber,
          });
          confirmError = undefined;
          break;
        } catch (e) {
          confirmError = e;
          if (attempt === 0 && isRetryableConfirmError(e)) continue;
          break;
        }
      }

      if (confirmError !== undefined) {
        patchResultHeatUnconfirmed(displayHeatNumber);
        const message =
          confirmError instanceof Error ? confirmError.message : "確定に失敗しました";
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
      }

      setHeatResultConfirmBusyHeat((prev) => (prev === displayHeatNumber ? null : prev));
    },
    [
      eventId,
      handleRankRecorded,
      patchResultHeatConfirmed,
      patchResultHeatUnconfirmed,
      clearResultDraftsForHeat,
      awaitResultDraftServerPatch,
      router,
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
