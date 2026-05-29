"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { MarshalDraftTogglePayload, MarshalResultPayload } from "@/components/MarshalStartListWidgets";
import { toast } from "sonner";
import { postParticipantStatusesBulk } from "@/lib/heatMarshalApi";
import { deleteHeatOperationDraftFireAndForget } from "@/lib/dayOpsHeatOperationDraftSync";
import {
  applyMarshalDraftOpsToHeats,
  marshalHeatMatchesDisplayIndex,
} from "@/components/startListRoundList/panelHelpers";
import type { LiveRoundMarshalContext, MarshalDraftOp } from "@/hooks/liveRound/types";

const MARSHAL_INLINE_AUTO_SAVE_MS = 350;

export function useMarshalDraftOps(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  statusUpdatedAtByKey: Record<string, string>;
}) {
  const { eventId, m, statusUpdatedAtByKey } = args;

  const [marshalDraftOps, setMarshalDraftOps] = useState<Record<string, MarshalDraftOp>>({});
  const [marshalDraftErrors, setMarshalDraftErrors] = useState<Record<string, string>>({});
  const [marshalBulkSubmitting, setMarshalBulkSubmitting] = useState(false);
  const [marshalPendingKey, setMarshalPendingKey] = useState<string | null>(null);
  const [marshalResult, setMarshalResult] = useState<MarshalResultPayload | null>(null);
  const [localMarshalHeats, setLocalMarshalHeats] = useState<HeatMarshalHeatRow[]>([]);

  const marshalDraftOpsRef = useRef(marshalDraftOps);
  marshalDraftOpsRef.current = marshalDraftOps;
  const marshalAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marshalAutoSaveInFlightRef = useRef(false);

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

  const heatsRef = useRef(localMarshalHeats);
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

  const commitMarshalDraftOps = useCallback(
    async (operations: MarshalDraftOp[], opts?: { silent?: boolean }) => {
      if (!m || operations.length === 0) return { committed: false as const };
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
        if (!opts?.silent) {
          toast.success(`${result.success.length}件を確定しました`);
        }
        const successOps = operations.filter((op) =>
          result.success.some((s) => s.opKey === op.opKey)
        );
        await m.onMarshalSuccess(successOps);
        const heatIndicesAfterBulk = new Set(successOps.map((o) => o.heatIndex));
        for (const hi of heatIndicesAfterBulk) {
          deleteHeatOperationDraftFireAndForget(m.competitionId, {
            eventId,
            round: m.round,
            heatIndex: hi,
          });
        }
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length}件の確定に失敗しました。行ごとのエラーを確認してください`
        );
      }
      return { committed: true as const, hadFailures: result.failed.length > 0 };
    },
    [m, eventId]
  );

  const flushMarshalDraftsToServer = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!m || m.marshalUiMode !== "inline") return;
      if (marshalAutoSaveInFlightRef.current || marshalBulkSubmitting) return;
      const operations = Object.values(marshalDraftOpsRef.current);
      if (operations.length === 0) return;
      marshalAutoSaveInFlightRef.current = true;
      try {
        await commitMarshalDraftOps(operations, { silent: opts?.silent ?? true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "反映に失敗しました");
        await m.onMarshalSuccess();
      } finally {
        marshalAutoSaveInFlightRef.current = false;
        if (Object.keys(marshalDraftOpsRef.current).length > 0) {
          scheduleMarshalAutoSaveRef.current?.();
        }
      }
    },
    [m, marshalBulkSubmitting, commitMarshalDraftOps]
  );

  const scheduleMarshalAutoSaveRef = useRef<(() => void) | null>(null);
  const scheduleMarshalAutoSave = useCallback(() => {
    if (m?.marshalUiMode !== "inline") return;
    if (marshalAutoSaveTimerRef.current) clearTimeout(marshalAutoSaveTimerRef.current);
    marshalAutoSaveTimerRef.current = setTimeout(() => {
      marshalAutoSaveTimerRef.current = null;
      void flushMarshalDraftsToServer({ silent: true });
    }, MARSHAL_INLINE_AUTO_SAVE_MS);
  }, [m?.marshalUiMode, flushMarshalDraftsToServer]);
  scheduleMarshalAutoSaveRef.current = scheduleMarshalAutoSave;

  useEffect(() => {
    return () => {
      if (marshalAutoSaveTimerRef.current) clearTimeout(marshalAutoSaveTimerRef.current);
    };
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
          round: (m?.round ?? "HEAT") as MarshalDraftOp["round"],
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
      scheduleMarshalAutoSave();
    },
    [
      eventId,
      m?.round,
      patchLaneCalled,
      patchLanePending,
      statusUpdatedAtByKey,
      scheduleMarshalAutoSave,
    ]
  );

  const discardMarshalDrafts = useCallback(() => {
    if (marshalAutoSaveTimerRef.current) {
      clearTimeout(marshalAutoSaveTimerRef.current);
      marshalAutoSaveTimerRef.current = null;
    }
    setMarshalDraftOps({});
    setMarshalDraftErrors({});
    if (m) {
      void m.onMarshalSuccess();
    }
  }, [m]);

  const waitForMarshalAutoSaveIdle = useCallback(async () => {
    for (let i = 0; i < 80 && marshalAutoSaveInFlightRef.current; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, []);

  /** 締切直前: 自動保存待ちを捨て、当該ヒートの未確定チェックをサーバーへ送る。失敗時は false */
  const flushMarshalDraftsBeforeHeatClose = useCallback(
    async (displayHeatNumber: number): Promise<boolean> => {
      if (!m) return false;
      if (marshalAutoSaveTimerRef.current) {
        clearTimeout(marshalAutoSaveTimerRef.current);
        marshalAutoSaveTimerRef.current = null;
      }
      await waitForMarshalAutoSaveIdle();
      const operations = Object.values(marshalDraftOpsRef.current).filter(
        (op) => op.heatIndex === displayHeatNumber
      );
      if (operations.length === 0) return true;
      if (marshalAutoSaveInFlightRef.current) {
        await waitForMarshalAutoSaveIdle();
      }
      if (marshalAutoSaveInFlightRef.current) return false;
      const result = await commitMarshalDraftOps(operations, { silent: true });
      return !result.hadFailures;
    },
    [m, waitForMarshalAutoSaveIdle, commitMarshalDraftOps]
  );

  const submitMarshalDrafts = useCallback(async () => {
    if (!m) return;
    if (marshalAutoSaveTimerRef.current) {
      clearTimeout(marshalAutoSaveTimerRef.current);
      marshalAutoSaveTimerRef.current = null;
    }
    await waitForMarshalAutoSaveIdle();
    const operations = Object.values(marshalDraftOpsRef.current);
    if (operations.length === 0) return;
    if (marshalAutoSaveInFlightRef.current) return;
    setMarshalBulkSubmitting(true);
    try {
      const { hadFailures } = await commitMarshalDraftOps(operations, { silent: false });
      if (!hadFailures) {
        setMarshalResult(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一括確定に失敗しました");
      await m.onMarshalSuccess();
    } finally {
      setMarshalBulkSubmitting(false);
    }
  }, [m, commitMarshalDraftOps, waitForMarshalAutoSaveIdle]);

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
    handleMarshalResult,
  };
}
