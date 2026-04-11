import { requireClubAdmin } from "./accessControl";

/**
 * クラブアクセス権限をチェック
 * - ClubAdmin/Manager: 自クラブへのアクセス OK
 * - PF_ADMIN: すべてのクラブへのアクセス OK
 * - 協会管理者（AssociationAdmin.ADMIN）: クラブアクセス不可（常に NG）
 */
export async function requireClubAccess(
  clubId: string,
  userId: string
): Promise<void> {
  await requireClubAdmin(clubId, userId);
}
