import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { isClubAdminRole } from "@/lib/roleScopes";

// 活動記録削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ clubId: string; activityId: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const clubId = params.clubId;
    const activityId = params.activityId;

    // 活動記録を取得
    const record = await prisma.clubActivityRecord.findUnique({
      where: { id: activityId },
    });

    if (!record || record.clubId !== clubId) {
      return NextResponse.json(
        { error: "Activity record not found" },
        { status: 404 }
      );
    }

    // 管理者または投稿者本人かチェック
    const membership = await prisma.membership.findFirst({
      where: {
        clubId,
        userId: session.userId,
        status: "APPROVED",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAuthor = record.authorId === session.userId;
    const isClubAdmin = isClubAdminRole(membership.role);

    if (!isAuthor && !isClubAdmin) {
      return NextResponse.json(
        { error: "Only the author or admins can delete activity records" },
        { status: 403 }
      );
    }

    await prisma.clubActivityRecord.delete({
      where: { id: activityId },
    });

    return NextResponse.json({ message: "Activity record deleted successfully" });
  } catch (error) {
    return jsonInternalError500("DELETE api/clubs/[clubId]/activities/[activityId]/route.ts", error);
  }
}
