import { hasOrgAdminAccess } from "@/lib/roleScopes";

/**
 * 大会のスタートリスト設定（ヒート分割・次ラ生成・種目のラウンド数・表示順・ステップ1確定など）を編集できるか。
 * 主催団体の org 管理者、または大会ごとの当日運用アクセス暗号でアンロック済み（HttpOnly クッキー）の端末。
 */
export function canManageCompetitionStartListSettings(args: {
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: string | null }>;
  hasDayOpsUnlock?: boolean;
}): boolean {
  if (hasOrgAdminAccess(args.orgAdminsForCurrentUser)) return true;
  return Boolean(args.hasDayOpsUnlock);
}
