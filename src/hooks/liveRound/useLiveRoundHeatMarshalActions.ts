"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { postParticipantStatusesBulk } from "@/lib/heatMarshalApi";
import { deleteHeatOperationDraftFireAndForget } from "@/lib/dayOpsHeatOperationDraftSync";
import type { LiveRoundMarshalContext, MarshalDraftOp } from "@/hooks/liveRound/types";

export function useLiveRoundHeatMarshalActions(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  marshalDraftOps: Record<string, MarshalDraftOp>;
  setMarshalDraftOps: Dispatch<SetStateAction<Record<string, MarshalDraftOp>>>;
  setMarshalDraftErrors: Dispatch<SetStateAction<Record<string, string>>>;
  patchHeatCallClosed: (heatIndex1Based: number) => void;
  patchHeatCallReopened: (heatIndex1Based: number) => void;
}) {
  const {
    eventId,
    m,
    marshalDraftOps,
    setMarshalDraftOps,
    setMarshalDraftErrors,
    patchHeatCallClosed,
    patchHeatCallReopened,
  } = args;

  const [heatCloseTarget, setHeatCloseTarget] = useState<number | null>(null);
  const [heatCloseBusy, setHeatCloseBusy] = useState(false);
  const [heatReopenTarget, setHeatReopenTarget] = useState<number | null>(null);
  const [heatReopenBusy, setHeatReopenBusy] = useState(false);

  const runHeatMarshalClose = useCallback(
    async (displayHeatNumber: number) => {
      if (!m) return;
      setHeatCloseBusy(true);
      try {
        const draftForHeat = Object.values(marshalDraftOps).filter(
          (op) => op.heatIndex === displayHeatNumber
        );
        if (draftForHeat.length > 0) {
          const bulkResult = await postParticipantStatusesBulk(m.competitionId, draftForHeat);
          const failedMap: Record<string, string> = {};
          for (const f of bulkResult.failed) failedMap[f.opKey] = f.error;
          setMarshalDraftErrors((prev) => ({ ...prev, ...failedMap }));
          if (bulkResult.failed.length > 0) {
            toast.error("未確定チェックの反映に失敗したため、締切を中止しました");
            return;
          }
          const successKeys = new Set(bulkResult.success.map((s) => s.opKey));
          setMarshalDraftOps((prev) => {
            if (successKeys.size === 0) return prev;
            const next = { ...prev };
            for (const key of successKeys) delete next[key];
            return next;
          });
          setMarshalDraftErrors((prev) => {
            if (successKeys.size === 0) return prev;
            const next = { ...prev };
            for (const key of successKeys) delete next[key];
            return next;
          });
        }

        const putRes = await fetch(`/api/competitions/${m.competitionId}/day-ops/heat-marshal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            round: m.round,
            heatIndex: displayHeatNumber,
            isClosed: true,
          }),
        });
        const putData = (await putRes.json().catch(() => ({}))) as { error?: string };
        if (!putRes.ok) {
          throw new Error(putData.error || "ヒート召集締切に失敗しました");
        }

        patchHeatCallClosed(displayHeatNumber);
        setHeatCloseTarget(null);
        await m.onMarshalSuccess();
        deleteHeatOperationDraftFireAndForget(m.competitionId, {
          eventId,
          round: m.round,
          heatIndex: displayHeatNumber,
        });
        toast.success(
          `ヒート${displayHeatNumber}のマーシャルを締め切りました。未召集のレーンは未出場扱いです（競技中の失格 DSQ とは別）`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "処理に失敗しました");
      } finally {
        setHeatCloseBusy(false);
      }
    },
    [m, marshalDraftOps, eventId, patchHeatCallClosed, setMarshalDraftErrors, setMarshalDraftOps]
  );

  const runHeatMarshalReopen = useCallback(
    async (displayHeatNumber: number) => {
      if (!m) return;
      setHeatReopenBusy(true);
      try {
        const putRes = await fetch(`/api/competitions/${m.competitionId}/day-ops/heat-marshal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            round: m.round,
            heatIndex: displayHeatNumber,
            isClosed: false,
          }),
        });
        const putData = (await putRes.json().catch(() => ({}))) as { error?: string };
        if (!putRes.ok) {
          throw new Error(putData.error || "マーシャル締切の解除に失敗しました");
        }
        patchHeatCallReopened(displayHeatNumber);
        setHeatReopenTarget(null);
        await m.onMarshalSuccess();
        toast.success(`ヒート ${displayHeatNumber} のマーシャルを受付中に戻しました`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "処理に失敗しました");
      } finally {
        setHeatReopenBusy(false);
      }
    },
    [m, eventId, patchHeatCallReopened]
  );

  return {
    heatCloseTarget,
    setHeatCloseTarget,
    heatCloseBusy,
    heatReopenTarget,
    setHeatReopenTarget,
    heatReopenBusy,
    runHeatMarshalClose,
    runHeatMarshalReopen,
  };
}
