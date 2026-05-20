import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ associationId: string }> }
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

    const actor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });

    if (!actor || actor.role !== "PF_ADMIN") {
      return NextResponse.json(
        { error: "PF管理者権限が必要です" },
        { status: 403 }
      );
    }

    const { associationId } = await context.params;
    const body = await request.json();
    const userEmail =
      typeof body?.userEmail === "string" ? body.userEmail.trim() : "";

    if (!userEmail) {
      return NextResponse.json(
        { error: "メールアドレスは必須です" },
        { status: 400 }
      );
    }

    const [association, user] = await Promise.all([
      prisma.association.findUnique({
        where: { id: associationId },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          profile: { select: { familyName: true, givenName: true } },
          role: true,
        },
      }),
    ]);

    if (!association) {
      return NextResponse.json(
        { error: "協会が見つかりません" },
        { status: 404 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    if (user.role === "PF_ADMIN") {
      return NextResponse.json(
        { error: "PF管理者には個別の協会権限付与は不要です" },
        { status: 400 }
      );
    }

    const associationAdmin = await prisma.$transaction(async (tx) => {
      const created = await tx.associationAdmin.create({
        data: {
          associationId: association.id,
          userId: user.id,
          role: "ADMIN",
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
            },
          },
          association: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "ASSOCIATION_ADMIN_GRANT",
          target: association.id,
          meta: {
            grantedUserId: user.id,
            grantedAssociationId: association.id,
            role: "ADMIN",
          },
        },
      });

      return created;
    });

    return NextResponse.json(associationAdmin);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "このユーザーにはすでに協会アクセス権限があります" },
        { status: 409 }
      );
    }

    return jsonInternalError500(
      "POST api/associations/[associationId]/admins/route.ts",
      error
    );
  }
}
