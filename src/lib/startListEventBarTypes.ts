/** スタートリスト／タイムスケジュール用の種目行（IndexBars・ヒート保存マージで共通） */
export type StartListEventBarItem = {
  id: string;
  name: string;
  sex: string;
  type: "INDIVIDUAL" | "TEAM";
  displayOrder: number;
  ageCategoryId?: string | null;
  ageCategoryName?: string | null;
  /** 年齢カテゴリの表示順（ラウンド設定タブの並びに使用） */
  ageCategoryDisplayOrder?: number | null;
  scheduledStartAt?: Date | string | null;
  /** ラウンド別の想定開始（API・DB の JSON） */
  roundScheduledStarts?: unknown;
  scheduledEndAt?: Date | string | null;
  /** スタートリストのラウンド数（全ラウンド） */
  startListRoundCount?: number;
  scheduleTabId?: string | null;
  scheduleTabSortOrder?: number | null;
  /** 確定エントリー相当の件数（ラウンド設定カード用） */
  entryCount?: number;
  preliminaryHeatLaneCount?: number | null;
  /** ヒート計画確定日時 */
  startListHeatPlanConfirmedAt?: Date | string | null;
  marshalStartedAt?: Date | string | null;
  /** マーシャル作業が始まったラウンド（設定変更不可） */
  marshalLockedRounds?: Array<"HEAT" | "SEMI" | "FINAL">;
};
