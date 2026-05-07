import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { requireClubAdmin } from "@/lib/accessControl";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "クラブの管理者のみがロゴを削除できます" },
        { status: 403 }
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { logoUrl: true },
    });

    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    if (!club.logoUrl) {
      return NextResponse.json({ error: "削除するロゴが存在しません" }, { status: 404 });
    }

    if (club.logoUrl.startsWith("/")) {
      try {
        const rel = club.logoUrl.replace(/^\//, "");
        const filePath = join(process.cwd(), "public", rel);
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      } catch (error) {
        console.error("Failed to delete club logo file:", error);
      }
    }

    await prisma.club.update({
      where: { id: clubId },
      data: { logoUrl: null },
    });

    return NextResponse.json({ message: "ロゴを削除しました" });
  } catch (error) {
    return jsonInternalError500("DELETE api/clubs/[clubId]/logo/delete/route.ts", error);
  }
}
