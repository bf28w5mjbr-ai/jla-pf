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
    patchHeatCallClosed,
    patchHeatCallReopened,
    patchLaneCalled,
    handleMarshalResult,
  };
}
