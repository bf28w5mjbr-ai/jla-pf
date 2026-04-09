import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 管理者権限チェック
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'ORG_ADMIN' && user.role !== 'PF_ADMIN')) {
      return NextResponse.json(
        { error: "管理者権限が必要です" },
        { status: 403 }
      );
    }

    const { status } = await req.json();

    if (!status || !['APPLYING', 'JLA_APPROVED', 'APPROVED', 'SUSPENDED'].includes(status)) {
      return NextResponse.json(
        { error: "無効なステータスです" },
        { status: 400 }
      );
    }

    // クラブのステータスを更新
    const club = await prisma.club.update({
      where: { id: clubId },
      data: { status },
    });

    return NextResponse.json({
      message: "ステータスを更新しました",
      club,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/admin/clubs/[clubId]/status/route.ts", error);
  }
}
