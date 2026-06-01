import { prisma } from "@/server/db";

/** 承認済みクラブ ADMIN の membership が 1 件以上あるか（軽量判定） */
export async function userHasApprovedClubAdminRole(userId: string): Promise<boolean> {
  const row = await prisma.membership.findFirst({
    where: { userId, status: "APPROVED", role: "ADMIN" },
    select: { id: true },
  });
  return row != null;
}
