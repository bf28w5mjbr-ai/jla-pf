import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unlink } from "fs/promises";
import path from "path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { deletePublicAssetByUrl } from "@/lib/supabase/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 添付ファイルを取得
    const attachment = await prisma.competitionAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // 権限チェック
    if (!hasOrgAdminAccess(attachment.competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ファイルを削除
    try {
      if (attachment.fileUrl.startsWith("http")) {
        await deletePublicAssetByUrl(attachment.fileUrl);
      } else {
        const filePath = path.join(process.cwd(), "public", attachment.fileUrl);
        await unlink(filePath);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      // ファイル削除失敗してもDBレコードは削除する
    }

    // データベースから削除
    await prisma.competitionAttachment.delete({
      where: { id: attachmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/attachments/[attachmentId]/route.ts", error);
  }
}
