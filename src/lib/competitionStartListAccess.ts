import { hasOrgAdminAccess } from "@/lib/roleScopes";

/**
 * 公開ページのタイムスケジュール（エリアタブ・種目の並び・開始日時・ラウンド数など）を編集できるか。
 * 主催団体の org 管理者（ADMIN）のみ。当日運用パスフレーズでは不可。
 */
export function canEditCompetitionPublishedSchedule(args: {
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: string | null }>;
}): boolean {
  return hasOrgAdminAccess(args.orgAdminsForCurrentUser);
}

/**
 * 大会のスタートリスト設定（ヒート分割・次ラ生成・マーシャル運用・当日のヒート JSON 更新など）を編集できるか。
 * 主催団体の org 管理者、または大会ごとの当日運用アクセス暗号でアンロック済み（HttpOnly クッキー）の端末。
 *
 * 公開タイムテーブル／ラウンド構成の編集は {@link canEditCompetitionPublishedSchedule} を使うこと。
 */
export function canManageCompetitionStartListSettings(args: {
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: string | null }>;
  hasDayOpsUnlock?: boolean;
}): boolean {
  if (hasOrgAdminAccess(args.orgAdminsForCurrentUser)) return true;
  return Boolean(args.hasDayOpsUnlock);
}
