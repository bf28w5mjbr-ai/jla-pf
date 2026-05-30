import type { ResultRound } from "@prisma/client";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import type { HeatResultCaptureRow } from "@/lib/heatResultCaptureApi";

import type { StartListTabDisplaySource } from "@/lib/startListEventTabDisplay";

export type IndividualItem = { entryId: string; name: string; clubName?: string | null };
export type TeamItem = {
  teamEntryId: string;
  teamName: string;
  clubName?: string | null;
  members: string[];
};

export type SnapshotParticipant =
  | {
      kind: "INDIVIDUAL";
      name: string;
      entryId?: string;
      clubName?: string | null;
    }
  | {
      kind: "TEAM";
      teamName: string;
      clubName?: string | null;
      members?: string[];
    };

export type SnapshotRoundBlock = {
  round: "HEAT" | "SEMI" | "FINAL";
  heats: Array<{
    heatIndex: number;
    /** スナップショット JSON 由来のため緩い型 */
    participants: unknown[];
  }>;
};

export type LiveRoundContentProps = {
  eventId: string;
  isTeam: boolean;
  individualHeats: IndividualItem[][];
  teamHeats: TeamItem[][];
  /**
   * 各行のスナップショット上の heatIndex。未指定時は行順で 1,2,3…（プレビュー用の仮分割と一致）。
   */
  marshalDisplayHeatIndices?: number[] | null;
  heatAdvanceQuotas?: (number | null)[] | null;
  /** サーバー同期の I:entryId / T:teamId → status（participantStatusRows が無いときのフォールバック） */
  participantStatusByKey?: Readonly<Record<string, string>> | null;
  /** 当日運用の全行（marshalRound 付き）。指定かつ marshalRoundForDisplay があるとタブごとに正しく集計 */
  participantStatusRows?: ReadonlyArray<{
    participantType: string;
    competitionEntryId: string | null;
    teamEntryId: string | null;
    status: string;
    marshalRound: ResultRound;
    updatedAt: Date | string;
    calledAt?: Date | string | null;
  }> | null;
  marshalRoundForDisplay?: ResultRound | null;
  /** ステップ1 確定済みなら true（失格管理の表示。ラウンド不一致でもマーシャル操作より優先して出す） */
  heatPlanConfirmedForDsq?: boolean;
  /** 表示中タブのマーシャル（主催管理者・スナップショット連動） */
  displaySource?: StartListTabDisplaySource;
  previewEstimatedParticipants?: number;
  previewMaxLanesPerHeat?: number;
  startListMarshal?: {
    heats: HeatMarshalHeatRow[] | null;
    loading: boolean;
    /** heat-marshal GET が返した実効ラウンド（PUT / 締切 / リザルト API と一致させる） */
    round: ResultRound;
    competitionId: string;
    marshalOpsBlocked: boolean;
    /**
     * true のとき、タブのラウンドと API が返したラウンドが一致しない（例: 次ラ未スナップショットで API が先頭ラにフォールバック）。
     * プレビュー表示と heats が対応しないため誤った「未登録」を出さず、操作もブロックする。
     */
    marshalRoundMismatch?: boolean;
    isCallClosed: boolean;
    onMarshalSuccess: (
      appliedOps?: ReadonlyArray<import("@/hooks/liveRound/types").MarshalDraftOp>,
      options?: import("@/hooks/liveRound/types").OnMarshalSuccessOptions
    ) => void | Promise<void>;
    /** dialog: 一覧のみ。inline: マーシャル。result: リザルト（チェック・NFCで着順） */
    marshalUiMode?: "dialog" | "inline" | "result";
    /** marshalUiMode が result のときのみ使用 */
    resultCapture?: {
      rows: HeatResultCaptureRow[];
      locked: boolean;
      loading: boolean;
      confirmedHeats: number[];
      onRefetch: () => void | Promise<void>;
    };
  } | null;
};
