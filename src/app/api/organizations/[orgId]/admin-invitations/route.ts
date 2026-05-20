import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import {
  inviteOrgAdmin,
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "@/lib/orgAdminInvitationService";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const token = _request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { orgId: organizationId } = await context.params;

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const invitations = await prisma.organizationAdminInvitation.findMany({
      where: {
        organizationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      include: {
        invitedUser: {
          select: {
            id: true,
            email: true,
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    return jsonInternalError500("GET admin-invitations", error);
  }
}

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

    const { orgId: organizationId } = await context.params;

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "招待を送る権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { userId: bodyUserId, userEmail, email, role } = body ?? {};

    const rawUserId = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
    const emailFromBody =
      (typeof userEmail === "string" ? userEmail.trim() : "") ||
      (typeof email === "string" ? email.trim() : "");

    if (!rawUserId && !emailFromBody) {
      return NextResponse.json(
        { error: "招待するユーザーを指定してください（userId またはメールアドレス）" },
        { status: 400 }
      );
    }

    const user = rawUserId
      ? await prisma.user.findFirst({ where: { id: rawUserId, deletedAt: null } })
      : await prisma.user.findFirst({ where: { email: emailFromBody, deletedAt: null } });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const result = await inviteOrgAdmin(
      session.userId,
      organizationId,
      user.id,
      typeof role === "string" ? role : undefined
    );

    return NextResponse.json({
      message: "招待を送信しました",
      invitationId: result.invitationId,
    });
  } catch (error) {
    if (error instanceof OrgAdminInvitationError) {
      return NextResponse.json(
        { error: error.message },
        { status: orgAdminInvitationErrorStatus(error.code) }
      );
    }
    return jsonInternalError500("POST admin-invitations", error);
  }
}
