import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { clubId } = await context.params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "このクラブに所属していません" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error:
          "所属の解除はクラブ管理者がメンバー管理から行います。ご自身での退会操作はできません。",
      },
      { status: 403 }
    );
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/leave/route.ts", error);
  }
}
