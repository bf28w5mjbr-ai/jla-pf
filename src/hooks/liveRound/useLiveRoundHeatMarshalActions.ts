"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { deleteHeatOperationDraftFireAndForget } from "@/lib/dayOpsHeatOperationDraftSync";
import type { LiveRoundMarshalContext } from "@/hooks/liveRound/types";

export function useLiveRoundHeatMarshalActions(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  flushMarshalDraftsBeforeHeatClose?: (displayHeatNumber: number) => Promise<boolean>;
  patchHeatCallClosed: (heatIndex1Based: number) => void;
  patchHeatCallReopened: (heatIndex1Based: number) => void;
}) {
  const {
    eventId,
    m,
    flushMarshalDraftsBeforeHeatClose,
    patchHeatCallClosed,
    patchHeatCallReopened,
  } = args;

  const [heatCloseTarget, setHeatCloseTarget] = useState<number | null>(null);
  const [heatCloseBusy, setHeatCloseBusy] = useState(false);
  const [heatReopenTarget, setHeatReopenTarget] = useState<number | null>(null);
  const [heatReopenBusy, setHeatReopenBusy] = useState(false);

  const runHeatMarshalClose = useCallback(
    async (displayHeatNumber: number) => {
      if (!m) {
        toast.error("マーシャル状態を読み込み中です。しばらく待ってから再度お試しください。");
        return;
      }
      setHeatCloseBusy(true);
      try {
        const draftsFlushed = (await flushMarshalDraftsBeforeHeatClose?.(displayHeatNumber)) ?? true;
        if (!draftsFlushed) {
          toast.error("未確定チェックの反映に失敗したため、締切を中止しました");
          return;
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
        await m.onMarshalSuccess(undefined, {
          heatCallWindowOnly: true,
          heatIndex: displayHeatNumber,
          callClosed: true,
        });
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
    [m, eventId, flushMarshalDraftsBeforeHeatClose, patchHeatCallClosed]
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
        await m.onMarshalSuccess(undefined, {
          heatCallWindowOnly: true,
          heatIndex: displayHeatNumber,
          callClosed: false,
        });
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
