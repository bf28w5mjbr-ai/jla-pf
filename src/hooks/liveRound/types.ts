import type { ResultRound } from "@prisma/client";

export type MarshalDraftOp = {
  opKey: string;
  eventId: string;
  round: ResultRound;
  heatIndex: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string | null;
  status: "CALLED" | "PENDING";
  lastKnownUpdatedAt?: string | null;
  draftSequence?: number;
};

export type ResultDraftOp = {
  opKey: string;
  heatIndex: number;
  tieWithPrevious: boolean;
  inputOrder: "asc" | "desc";
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string;
  teamEntryId?: string;
  teamMemberUserId?: string;
  draftSequence?: number;
};

export type OnMarshalSuccessOptions = {
  /** ヒート締切/再開のみ。heat-marshal 全量 GET と router.refresh を省略 */
  heatCallWindowOnly?: boolean;
  heatIndex?: number;
  callClosed?: boolean;
  /** 楽観更新のみ。参加者ポーリング・リザルト再取得を省略（締切直前の draft flush 向け） */
  localPatchOnly?: boolean;
};

export type LiveRoundMarshalContext = {
  heats: import("@/components/HeatMarshalLanePanel").HeatMarshalHeatRow[] | null;
  loading: boolean;
  callWindowLoading?: boolean;
  round: ResultRound;
  competitionId: string;
  marshalOpsBlocked: boolean;
  marshalRoundMismatch?: boolean;
  isCallClosed: boolean;
  marshalUiMode?: "inline" | "result";
  onMarshalSuccess: (
    appliedOps?: ReadonlyArray<MarshalDraftOp>,
    options?: OnMarshalSuccessOptions
  ) => void | Promise<void>;
  setMarshalSyncDeferred?: (deferred: boolean) => void;
  resultCapture?: {
    rows: import("@/lib/heatResultCaptureApi").HeatResultCaptureRow[];
    locked: boolean;
    loading: boolean;
    confirmedHeats: number[];
    onRefetch: () => void;
    patchHeatConfirmed: (heatIndex: number) => void;
    patchHeatUnconfirmed: (heatIndex: number) => void;
  };
} | null;
