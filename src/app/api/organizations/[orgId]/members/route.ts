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
    const { userId: bodyUserId, userEmail, email, role } = body ?? {};

    const rawUserId = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
    const emailFromBody =
      (typeof userEmail === "string" ? userEmail.trim() : "") ||
      (typeof email === "string" ? email.trim() : "");

    if (!rawUserId && !emailFromBody) {
      return NextResponse.json(
        { error: "追加するユーザーを指定してください（userId またはメールアドレス）" },
        { status: 400 }
      );
    }

    const user = rawUserId
      ? await prisma.user.findFirst({
          where: { id: rawUserId, deletedAt: null },
        })
      : await prisma.user.findFirst({
          where: { email: emailFromBody, deletedAt: null },
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
