import { redirect } from "next/navigation";
import { requireClubAdmin } from "./accessControl";
import { appRoutes } from "@/lib/appRoutes";
import { prisma } from "@/lib/prisma";

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

/**
 * クラブ詳細（メンバー一覧など）の閲覧可否。
 * 承認済みメンバー、または PF 管理者のみ。
 */
export async function canViewClubDetailPage(clubId: string, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (user.role === "PF_ADMIN") return true;

  const membership = await prisma.membership.findFirst({
    where: { clubId, userId, status: "APPROVED" },
    select: { id: true },
  });
  return !!membership;
}

/**
 * クラブ詳細ページ用。閲覧権がなければクラブ一覧へ。
 * （`/clubs/[id]/join` は別ルートのため対象外）
 */
export async function redirectUnlessCanViewClubDetail(clubId: string, userId: string): Promise<void> {
  const allowed = await canViewClubDetailPage(clubId, userId);
  if (!allowed) {
    redirect(appRoutes.profile.clubs());
  }
}
