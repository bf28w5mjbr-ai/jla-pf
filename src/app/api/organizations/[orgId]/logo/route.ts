import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { isValidOrganizationLogoUrl } from "@/lib/organizationLogo";

/**
 * 団体ロゴを画像URLで設定する（アップロード以外の柔軟な指定用）。
 * body: { logoUrl: string } または { logoUrl: null } でクリア
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        admins: { where: { userId: session.userId } },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "団体が見つかりません" }, { status: 404 });
    }

    if (!hasOrgAdminAccess(organization.admins)) {
      return NextResponse.json({ error: "ロゴを変更する権限がありません" }, { status: 403 });
    }

    const body = (await request.json()) as { logoUrl?: string | null };
    const raw = body.logoUrl;

    if (raw === null || raw === "") {
      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: { logoUrl: null },
      });
      return NextResponse.json({
        message: "ロゴを削除しました",
        logoUrl: updated.logoUrl,
      });
    }

    if (typeof raw !== "string" || !isValidOrganizationLogoUrl(raw)) {
      return NextResponse.json(
        {
          error:
            "有効なHTTPSの画像URLを入力してください（localhost の http は開発用に可）",
        },
        { status: 400 },
      );
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { logoUrl: raw.trim() },
    });

    return NextResponse.json({
      message: "ロゴURLを更新しました",
      logoUrl: updated.logoUrl,
    });
  } catch (error) {
    return jsonInternalError500("PATCH api/organizations/[orgId]/logo/route.ts", error);
  }
}
