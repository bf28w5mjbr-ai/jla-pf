import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { hostOrgAdminCanManageOnboarding } from "@/lib/roleScopes";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 団体とユーザーの権限を確認
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        admins: {
          where: { userId: session.userId },
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "団体が見つかりません" },
        { status: 404 }
      );
    }

    if (!hostOrgAdminCanManageOnboarding(organization.admins, organization.status)) {
      return NextResponse.json(
        { error: "ロゴを削除する権限がありません" },
        { status: 403 }
      );
    }

    // 現在のロゴURLを確認
    if (!organization.logoUrl) {
      return NextResponse.json(
        { error: "削除するロゴが存在しません" },
        { status: 404 }
      );
    }

    // ファイルを削除
    try {
      const filePath = join(process.cwd(), "public", organization.logoUrl);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
      // ファイル削除に失敗してもDBは更新する
    }

    // 団体情報を更新（logoUrlをnullに）
    await prisma.organization.update({
      where: { id: orgId },
      data: { logoUrl: null },
    });

    return NextResponse.json({ message: "ロゴを削除しました" });
  } catch (error) {
    return jsonInternalError500("DELETE api/organizations/[orgId]/logo/delete/route.ts", error);
  }
}
