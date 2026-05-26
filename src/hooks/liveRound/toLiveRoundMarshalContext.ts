import type { LiveRoundContentProps } from "@/components/startListRoundList/types";
import type { LiveRoundMarshalContext } from "@/hooks/liveRound/types";

export function toLiveRoundMarshalContext(
  m: LiveRoundContentProps["startListMarshal"]
): LiveRoundMarshalContext {
  if (!m) return null;
  return {
    heats: m.heats,
    loading: m.loading,
    round: m.round,
    competitionId: m.competitionId,
    marshalOpsBlocked: m.marshalOpsBlocked,
    marshalRoundMismatch: m.marshalRoundMismatch,
    isCallClosed: m.isCallClosed,
    marshalUiMode: m.marshalUiMode,
    onMarshalSuccess: m.onMarshalSuccess,
    resultCapture: m.resultCapture,
  };
}
