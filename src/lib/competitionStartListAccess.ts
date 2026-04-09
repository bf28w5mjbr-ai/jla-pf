import type { OfficialApplicationStatus } from "@prisma/client";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

/**
 * 大会のスタートリスト設定（ヒート分割・次ラ生成・種目のラウンド数・表示順・ステップ1確定など）を編集できるか。
 * 主催団体の org 管理者、または当該大会で承認済みオフィシャル。
 */
export function canManageCompetitionStartListSettings(args: {
  orgAdminsForCurrentUser: ReadonlyArray<{ role?: string | null }>;
  officialApplicationStatus?: OfficialApplicationStatus | null;
  hasOfficialAttendance?: boolean;
}): boolean {
  if (hasOrgAdminAccess(args.orgAdminsForCurrentUser)) return true;
  if (args.hasOfficialAttendance) return true;
  return args.officialApplicationStatus === "APPROVED";
}
