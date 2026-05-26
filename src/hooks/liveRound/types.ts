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

export type LiveRoundMarshalContext = {
  heats: import("@/components/HeatMarshalLanePanel").HeatMarshalHeatRow[] | null;
  loading: boolean;
  round: ResultRound;
  competitionId: string;
  marshalOpsBlocked: boolean;
  marshalRoundMismatch?: boolean;
  isCallClosed: boolean;
  marshalUiMode?: "dialog" | "inline" | "result";
  onMarshalSuccess: () => void | Promise<void>;
  resultCapture?: {
    rows: import("@/lib/heatResultCaptureApi").HeatResultCaptureRow[];
    locked: boolean;
    loading: boolean;
    confirmedHeats: number[];
    onRefetch: () => void;
  };
} | null;
