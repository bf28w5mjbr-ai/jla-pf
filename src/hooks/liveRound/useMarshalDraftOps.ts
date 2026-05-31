"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResultRound } from "@prisma/client";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { MarshalDraftTogglePayload, MarshalResultPayload } from "@/components/MarshalStartListWidgets";
import { toast } from "sonner";
import { postParticipantStatusesBulk } from "@/lib/heatMarshalApi";
import {
  deleteHeatOperationDraftFireAndForget,
  getHeatOperationDraft,
  isDayOpsMarshalDraftServerSyncEnabled,
  JLA_DAY_OPS_DRAFT_CHANGED,
  parseServerMarshalDraftPayload,
  patchHeatOperationDraftMarshalPayload,
  patchHeatOperationDraftMarshalPayloadFireAndForget,
  type HeatMarshalDraftServerEntry,
} from "@/lib/dayOpsHeatOperationDraftSync";
import {
  applyMarshalDraftOpsToHeats,
  marshalHeatMatchesDisplayIndex,
  mergeMarshalHeatOverlayOps,
  patchHeatMarshalCallWindowInHeats,
  pruneMarshalCommittedOps,
} from "@/components/startListRoundList/panelHelpers";
import { marshalHeatStatusSignature } from "@/lib/dayOpsPollCompare";
import type { LiveRoundMarshalContext, MarshalDraftOp } from "@/hooks/liveRound/types";

const MARSHAL_DRAFT_DEBOUNCE_MS = 180;
const MARSHAL_DRAFT_LOCAL_SYNC_GUARD_MS = 20_000;

type MarshalDraftSyncContext = {
  competitionId: string;
  round: ResultRound;
};

export function useMarshalDraftOps(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  statusUpdatedAtByKey: Record<string, string>;
  marshalDraftSyncContext: MarshalDraftSyncContext | null;
  /** マーシャルモード（非アクティブタブ含む draft 保存・pull） */
  marshalDraftSyncActive: boolean;
}) {
  const { eventId, m, statusUpdatedAtByKey, marshalDraftSyncContext, marshalDraftSyncActive } =
    args;

  const [marshalDraftOps, setMarshalDraftOps] = useState<Record<string, MarshalDraftOp>>({});
  /** サーバー保存済みだが heat-marshal GET が未反映の行（ポーリング巻き戻し防止） */
  const [marshalCommittedOps, setMarshalCommittedOps] = useState<Record<string, MarshalDraftOp>>({});
  const [marshalDraftErrors, setMarshalDraftErrors] = useState<Record<string, string>>({});
  const [marshalBulkSubmitting, setMarshalBulkSubmitting] = useState(false);
  const [marshalPendingKey, setMarshalPendingKey] = useState<string | null>(null);
  const [marshalResult, setMarshalResult] = useState<MarshalResultPayload | null>(null);
  const [localMarshalHeats, setLocalMarshalHeats] = useState<HeatMarshalHeatRow[]>([]);

  const marshalDraftOpsRef = useRef(marshalDraftOps);
  marshalDraftOpsRef.current = marshalDraftOps;
  const marshalDraftPatchTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastLocalMarshalDraftTouchRef = useRef(0);
  const marshalDraftSequenceRef = useRef(0);
  const marshalDraftSyncContextRef = useRef(marshalDraftSyncContext);
  const heatsRef = useRef<HeatMarshalHeatRow[]>([]);

  useEffect(() => {
    if (marshalDraftSyncContext) {
      marshalDraftSyncContextRef.current = marshalDraftSyncContext;
    }
  }, [marshalDraftSyncContext]);

  const marshalOverlayOps = useMemo(
    () => mergeMarshalHeatOverlayOps(marshalDraftOps, marshalCommittedOps),
    [marshalDraftOps, marshalCommittedOps]
  );

  useEffect(() => {
    const merged = applyMarshalDraftOpsToHeats(m?.heats ?? [], marshalOverlayOps);
    setLocalMarshalHeats((prev) =>
      marshalHeatStatusSignature(prev) === marshalHeatStatusSignature(merged) ? prev : merged
    );
  }, [m?.heats, marshalOverlayOps]);

  useEffect(() => {
    const heats = m?.heats;
    if (!heats?.length) return;
    setMarshalCommittedOps((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const pruned = pruneMarshalCommittedOps(heats, prev);
      if (Object.keys(pruned).length === Object.keys(prev).length) {
        let unchanged = true;
        for (const k of Object.keys(prev)) {
          if (pruned[k] !== prev[k]) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return prev;
      }
      return pruned;
    });
  }, [m?.heats]);

  const marshalHeatByDisplayNumber = useMemo(() => {
    const map = new Map<number, HeatMarshalHeatRow>();
    for (const h of localMarshalHeats) {
      const n = Number(h.heatIndex);
      if (Number.isFinite(n)) map.set(n, h);
    }
    return map;
  }, [localMarshalHeats]);

  heatsRef.current = localMarshalHeats;

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

  const buildMarshalDraftServerEntriesForHeat = useCallback((heatIndex: number) => {
    const entries: Record<string, HeatMarshalDraftServerEntry> = {};
    for (const op of Object.values(marshalDraftOpsRef.current)) {
      if (op.heatIndex === heatIndex) {
        entries[op.opKey] = op as HeatMarshalDraftServerEntry;
      }
    }
    return entries;
  }, []);

  const awaitMarshalDraftServerPatch = useCallback(
    async (heatIndex: number) => {
      if (!isDayOpsMarshalDraftServerSyncEnabled()) return;
      const timers = marshalDraftPatchTimerRef.current;
      clearTimeout(timers[heatIndex]);
      delete timers[heatIndex];
      const syncCtx = marshalDraftSyncContextRef.current;
      if (!syncCtx?.competitionId) return;
      const entries = buildMarshalDraftServerEntriesForHeat(heatIndex);
      try {
        await patchHeatOperationDraftMarshalPayload(syncCtx.competitionId, {
          eventId,
          round: syncCtx.round,
          heatIndex,
          entries,
        });
      } catch {
        /* 確定・締切時に bulk で反映する */
      }
    },
    [buildMarshalDraftServerEntriesForHeat, eventId]
  );

  const flushMarshalDraftServerPatch = useCallback(
    (heatIndex: number, options?: { keepalive?: boolean }) => {
      if (!isDayOpsMarshalDraftServerSyncEnabled()) return;
      const timers = marshalDraftPatchTimerRef.current;
      clearTimeout(timers[heatIndex]);
      delete timers[heatIndex];
      const syncCtx = marshalDraftSyncContextRef.current;
      if (!syncCtx?.competitionId) return;
      const entries = buildMarshalDraftServerEntriesForHeat(heatIndex);
      patchHeatOperationDraftMarshalPayloadFireAndForget(
        syncCtx.competitionId,
        { eventId, round: syncCtx.round, heatIndex, entries },
        options
      );
    },
    [buildMarshalDraftServerEntriesForHeat, eventId]
  );

  const flushAllMarshalDraftServerPatches = useCallback(
    (options?: { keepalive?: boolean }) => {
      if (!isDayOpsMarshalDraftServerSyncEnabled()) return;
      const timers = marshalDraftPatchTimerRef.current;
      for (const t of Object.values(timers)) clearTimeout(t);
      marshalDraftPatchTimerRef.current = {};
      const heatsToFlush = new Set<number>();
      for (const op of Object.values(marshalDraftOpsRef.current)) {
        heatsToFlush.add(op.heatIndex);
      }
      for (const hi of heatsToFlush) {
        if (Number.isFinite(hi)) flushMarshalDraftServerPatch(hi, options);
      }
    },
    [flushMarshalDraftServerPatch]
  );

  const scheduleMarshalDraftServerPatch = useCallback(
    (heatIndex: number) => {
      if (!isDayOpsMarshalDraftServerSyncEnabled()) return;
      if (!marshalDraftSyncActive) return;
      const timers = marshalDraftPatchTimerRef.current;
      clearTimeout(timers[heatIndex]);
      timers[heatIndex] = setTimeout(() => {
        lastLocalMarshalDraftTouchRef.current = Date.now();
        flushMarshalDraftServerPatch(heatIndex);
      }, MARSHAL_DRAFT_DEBOUNCE_MS);
    },
    [flushMarshalDraftServerPatch, marshalDraftSyncActive]
  );

  const commitMarshalDraftOps = useCallback(
    async (
      operations: MarshalDraftOp[],
      opts?: { silent?: boolean; localPatchOnly?: boolean }
    ) => {
      if (!m || operations.length === 0) return { committed: false as const };
      const competitionId = m.competitionId ?? marshalDraftSyncContextRef.current?.competitionId;
      if (!competitionId) return { committed: false as const };
      const result = await postParticipantStatusesBulk(competitionId, operations);
      const failedMap: Record<string, string> = {};
      for (const f of result.failed) failedMap[f.opKey] = f.error;
      setMarshalDraftErrors(failedMap);
      const successOps =
        result.success.length > 0
          ? operations.filter((op) => result.success.some((s) => s.opKey === op.opKey))
          : [];
      if (successOps.length > 0) {
        if (!opts?.silent) {
          toast.success(`${result.success.length}件を確定しました`);
        }
        if (m.onMarshalSuccess) {
          await m.onMarshalSuccess(
            successOps,
            opts?.localPatchOnly ? { localPatchOnly: true } : undefined
          );
        }
        setMarshalDraftOps((prev) => {
          const next = { ...prev };
          for (const op of successOps) delete next[op.opKey];
          return next;
        });
        setMarshalCommittedOps((prev) => {
          const next = { ...prev };
          for (const op of successOps) next[op.opKey] = op;
          return next;
        });
        const round = m.round ?? marshalDraftSyncContextRef.current?.round ?? "HEAT";
        const heatIndicesAfterBulk = new Set(successOps.map((o) => o.heatIndex));
        for (const hi of heatIndicesAfterBulk) {
          deleteHeatOperationDraftFireAndForget(competitionId, {
            eventId,
            round,
            heatIndex: hi,
          });
        }
      } else if (result.failed.length > 0) {
        setMarshalDraftOps((prev) => {
          const next: typeof prev = {};
          for (const f of result.failed) {
            if (prev[f.opKey]) next[f.opKey] = prev[f.opKey];
          }
          return next;
        });
      }
      if (result.failed.length > 0 && !opts?.silent) {
        toast.error(
          `${result.failed.length}件の確定に失敗しました。行ごとのエラーを確認してください`
        );
      }
      const firstFailedError = result.failed[0]?.error;
      return {
        committed: true as const,
        hadFailures: result.failed.length > 0,
        firstFailedError,
      };
    },
    [m, eventId]
  );

  const pullMarshalDraftsFromServer = useCallback(() => {
    if (!isDayOpsMarshalDraftServerSyncEnabled()) return;
    if (!marshalDraftSyncActive) return;
    if (Date.now() - lastLocalMarshalDraftTouchRef.current < MARSHAL_DRAFT_LOCAL_SYNC_GUARD_MS) {
      return;
    }
    const syncCtx = marshalDraftSyncContextRef.current;
    if (!syncCtx?.competitionId) return;

    void (async () => {
      for (const h of heatsRef.current) {
        const hi = Number(h.heatIndex);
        if (!Number.isFinite(hi) || h.callClosedAt) continue;
        try {
          const row = await getHeatOperationDraft(syncCtx.competitionId, {
            eventId,
            round: syncCtx.round,
            heatIndex: hi,
          });
          if (!row.updatedAt) continue;
          const serverUpdatedMs = Date.parse(row.updatedAt);
          if (!Number.isFinite(serverUpdatedMs)) continue;
          if (serverUpdatedMs <= lastLocalMarshalDraftTouchRef.current) continue;
          const entries = parseServerMarshalDraftPayload(row.marshalDraftPayload);
          if (!entries) continue;
          const entryKeys = Object.keys(entries);
          if (entryKeys.length === 0) {
            const hasLocalForHeat = Object.values(marshalDraftOpsRef.current).some(
              (op) => op.heatIndex === hi
            );
            if (hasLocalForHeat) continue;
          }

          setMarshalDraftOps((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
              if (next[k]!.heatIndex === hi) delete next[k];
            }
            for (const [k, v] of Object.entries(entries)) {
              if (v && typeof v === "object" && v.heatIndex === hi) {
                next[k] = v as MarshalDraftOp;
              }
            }
            marshalDraftOpsRef.current = next;
            return next;
          });
        } catch {
          // ignore per-heat errors
        }
      }
    })();
  }, [eventId, marshalDraftSyncActive]);

  useEffect(() => {
    if (!marshalDraftSyncActive || !isDayOpsMarshalDraftServerSyncEnabled()) return;
    pullMarshalDraftsFromServer();
  }, [marshalDraftSyncActive, pullMarshalDraftsFromServer]);

  useEffect(() => {
    if (!isDayOpsMarshalDraftServerSyncEnabled() || !marshalDraftSyncActive) return;
    const onVis = () => {
      if (document.visibilityState === "visible") pullMarshalDraftsFromServer();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [marshalDraftSyncActive, pullMarshalDraftsFromServer]);

  useEffect(() => {
    if (!marshalDraftSyncActive || !marshalDraftSyncContext) return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ competitionId?: string; eventId?: string }>).detail;
      if (
        d?.competitionId === marshalDraftSyncContext.competitionId &&
        d?.eventId === eventId
      ) {
        pullMarshalDraftsFromServer();
      }
    };
    window.addEventListener(JLA_DAY_OPS_DRAFT_CHANGED, handler);
    return () => window.removeEventListener(JLA_DAY_OPS_DRAFT_CHANGED, handler);
  }, [marshalDraftSyncActive, marshalDraftSyncContext, eventId, pullMarshalDraftsFromServer]);

  useEffect(() => {
    return () => {
      flushAllMarshalDraftServerPatches({ keepalive: true });
    };
  }, [flushAllMarshalDraftServerPatches]);

  useEffect(() => {
    const onPageHide = () => {
      flushAllMarshalDraftServerPatches({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushAllMarshalDraftServerPatches]);

  const removeMarshalDraftOp = useCallback(
    (opKey: string, heatIndex: number) => {
      setMarshalDraftOps((prev) => {
        if (!prev[opKey]) return prev;
        const next = { ...prev };
        delete next[opKey];
        marshalDraftOpsRef.current = next;
        return next;
      });
      scheduleMarshalDraftServerPatch(heatIndex);
      flushMarshalDraftServerPatch(heatIndex);
    },
    [scheduleMarshalDraftServerPatch, flushMarshalDraftServerPatch]
  );

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
        const round = (m?.round ??
          marshalDraftSyncContextRef.current?.round ??
          "HEAT") as MarshalDraftOp["round"];
        setMarshalDraftOps((prev) => {
          const next = {
            ...prev,
            [opKey]: {
              opKey,
              eventId,
              round,
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
              draftSequence: ++marshalDraftSequenceRef.current,
            } satisfies MarshalDraftOp,
          };
          marshalDraftOpsRef.current = next;
          return next;
        });
      } else {
        patchLanePending(heatIndex, participant.lane);
        setMarshalCommittedOps((prev) => {
          if (!prev[opKey]) return prev;
          const next = { ...prev };
          delete next[opKey];
          return next;
        });
        setMarshalDraftOps((prev) => {
          if (!prev[opKey]) return prev;
          const next = { ...prev };
          delete next[opKey];
          marshalDraftOpsRef.current = next;
          return next;
        });
      }
      lastLocalMarshalDraftTouchRef.current = Date.now();
      scheduleMarshalDraftServerPatch(heatIndex);
      flushMarshalDraftServerPatch(heatIndex);
    },
    [
      eventId,
      m?.round,
      patchLaneCalled,
      patchLanePending,
      statusUpdatedAtByKey,
      scheduleMarshalDraftServerPatch,
      flushMarshalDraftServerPatch,
    ]
  );

  const discardMarshalDrafts = useCallback(() => {
    const timers = marshalDraftPatchTimerRef.current;
    for (const t of Object.values(timers)) clearTimeout(t);
    marshalDraftPatchTimerRef.current = {};
    const heatsWithDrafts = new Set(
      Object.values(marshalDraftOpsRef.current).map((o) => o.heatIndex)
    );
    setMarshalDraftOps({});
    setMarshalDraftErrors({});
    marshalDraftOpsRef.current = {};
    const syncCtx = marshalDraftSyncContextRef.current;
    const competitionId = m?.competitionId ?? syncCtx?.competitionId;
    const round = m?.round ?? syncCtx?.round;
    if (competitionId && round) {
      for (const hi of heatsWithDrafts) {
        deleteHeatOperationDraftFireAndForget(competitionId, { eventId, round, heatIndex: hi });
      }
    }
    if (m) {
      void m.onMarshalSuccess();
    }
  }, [m, eventId]);

  const flushMarshalDraftsBeforeHeatClose = useCallback(
    async (
      displayHeatNumber: number
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!m && !marshalDraftSyncContextRef.current) {
        return { ok: false, message: "マーシャル状態を読み込めませんでした" };
      }
      const timers = marshalDraftPatchTimerRef.current;
      clearTimeout(timers[displayHeatNumber]);
      delete timers[displayHeatNumber];
      await awaitMarshalDraftServerPatch(displayHeatNumber);
      const operations = Object.values(marshalDraftOpsRef.current)
        .filter((op) => op.heatIndex === displayHeatNumber)
        .map((op) => ({ ...op, lastKnownUpdatedAt: undefined }));
      if (operations.length === 0) return { ok: true };
      const result = await commitMarshalDraftOps(operations, { silent: true, localPatchOnly: true });
      if (!result.hadFailures) return { ok: true };
      return {
        ok: false,
        message:
          result.firstFailedError ??
          "未確定チェックの反映に失敗しました。行のエラーを確認してください",
      };
    },
    [m, commitMarshalDraftOps, awaitMarshalDraftServerPatch]
  );

  const submitMarshalDrafts = useCallback(async () => {
    const timers = marshalDraftPatchTimerRef.current;
    for (const t of Object.values(timers)) clearTimeout(t);
    marshalDraftPatchTimerRef.current = {};
    await flushAllMarshalDraftServerPatches();
    const operations = Object.values(marshalDraftOpsRef.current);
    if (operations.length === 0) return;
    setMarshalBulkSubmitting(true);
    try {
      const heats = new Set(operations.map((o) => o.heatIndex));
      for (const hi of heats) {
        await awaitMarshalDraftServerPatch(hi);
      }
      const { hadFailures } = await commitMarshalDraftOps(operations, { silent: false });
      if (!hadFailures) {
        setMarshalResult(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一括確定に失敗しました");
    } finally {
      setMarshalBulkSubmitting(false);
    }
  }, [commitMarshalDraftOps, awaitMarshalDraftServerPatch, flushAllMarshalDraftServerPatches]);

  const patchHeatCallClosed = useCallback((heatIndex1Based: number) => {
    setLocalMarshalHeats((prev) => patchHeatMarshalCallWindowInHeats(prev, heatIndex1Based, true));
  }, []);

  const patchHeatCallReopened = useCallback((heatIndex1Based: number) => {
    setLocalMarshalHeats((prev) => patchHeatMarshalCallWindowInHeats(prev, heatIndex1Based, false));
  }, []);

  const handleMarshalResult = useCallback(
    (r: MarshalResultPayload) => {
      setMarshalResult(r);
      void m?.onMarshalSuccess();
    },
    [m]
  );

  return {
    localMarshalHeats,
    marshalHeatByDisplayNumber,
    heatsRef,
    marshalDraftOps,
    setMarshalDraftOps,
    marshalDraftErrors,
    setMarshalDraftErrors,
    marshalBulkSubmitting,
    marshalPendingKey,
    setMarshalPendingKey,
    marshalResult,
    setMarshalResult,
    queueMarshalDraftToggle,
    discardMarshalDrafts,
    submitMarshalDrafts,
    flushMarshalDraftsBeforeHeatClose,
    patchHeatCallClosed,
    patchHeatCallReopened,
    patchLaneCalled,
    patchLanePending,
    removeMarshalDraftOp,
    handleMarshalResult,
    pullMarshalDraftsFromServer,
    marshalSyncBusy:
      Object.keys(marshalDraftOps).length > 0 ||
      Object.keys(marshalCommittedOps).length > 0 ||
      marshalBulkSubmitting ||
      marshalPendingKey !== null,
  };
}
