"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HeatMarshalLanePanel,
  type HeatMarshalHeatRow,
  type HeatMarshalParticipant,
} from "@/components/HeatMarshalLanePanel";

export type { HeatMarshalHeatRow, HeatMarshalParticipant };

type MarshalRoundKey = "HEAT" | "SEMI" | "FINAL";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  eventId: string;
  marshalRound: MarshalRoundKey;
  heat: HeatMarshalHeatRow | null;
  marshalOpsBlocked: boolean;
  isCallClosed: boolean;
  onSuccess?: () => void | Promise<void>;
};

export function HeatMarshalWorkDialog({
  open,
  onOpenChange,
  competitionId,
  eventId,
  marshalRound,
  heat,
  marshalOpsBlocked,
  isCallClosed,
  onSuccess,
}: Props) {
  const handleClose = (next: boolean) => {
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {heat ? (
          <>
            <DialogHeader>
              <DialogTitle>ヒート {heat.heatIndex} マーシャル</DialogTitle>
              <DialogDescription>
                レーンのチェック、または NFC をかざすと召集（CALLED）が記録されます（対応端末では開いた時点から読取待機します）。
              </DialogDescription>
            </DialogHeader>
            <HeatMarshalLanePanel
              competitionId={competitionId}
              eventId={eventId}
              marshalRound={marshalRound}
              heat={heat}
              marshalOpsBlocked={marshalOpsBlocked}
              isCallClosed={isCallClosed}
              onSuccess={onSuccess}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                閉じる
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>マーシャル</DialogTitle>
            <DialogDescription>読み込み中…</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
