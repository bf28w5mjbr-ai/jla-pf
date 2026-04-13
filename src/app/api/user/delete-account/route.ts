import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "無効なセッションです" }, { status: 401 });
    }

    const userId = session.userId;

    // ユーザーの存在確認
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phoneNumber: true },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    // トランザクションで関連データを削除
    await prisma.$transaction(async (tx) => {
      // 1. ログインセッションを削除
      await tx.loginSession.deleteMany({
        where: { userId },
      });

      // 2. ユーザーのセッションを削除（必要に応じて）
      // Session モデルがある場合
      // await tx.session.deleteMany({
      //   where: { userId },
      // });

      // 3. 関連データを削除（必要に応じて）
      // EntryItem, ClubMembership, OrgMembership など

      // 4. ユーザーを削除
      await tx.user.delete({
        where: { id: userId },
      });
    });

    // セッションクッキーを削除
    jar.delete("session");

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("POST api/user/delete-account/route.ts", error);
  }
}
