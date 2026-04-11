import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { normalizeOrgRoleForWrite } from "@/lib/roleScopes";
import { requireOrgAdmin } from "@/lib/accessControl";

// メンバー追加
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
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
    const organizationId = params.orgId;

    // 管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "メンバー追加権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userEmail, role } = body;

    if (!userEmail?.trim()) {
      return NextResponse.json(
        { error: "メールアドレスは必須です" },
        { status: 400 }
      );
    }

    // ユーザーを検索
    const user = await prisma.user.findUnique({
      where: { email: userEmail.trim() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    // すでにメンバーかチェック
    const existingAdmin = await prisma.orgAdmin.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { error: "このユーザーはすでにメンバーです" },
        { status: 400 }
      );
    }

    // メンバーを追加
    const newAdmin = await prisma.orgAdmin.create({
      data: {
        userId: user.id,
        organizationId,
        role: normalizeOrgRoleForWrite(role || "MEMBER"),
      },
      include: {
        user: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(newAdmin);
  } catch (error) {
    return jsonInternalError500("POST api/organizations/[orgId]/members/route.ts", error);
  }
}
