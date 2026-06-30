import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import { validateCompetitionAttachmentBuffer } from "@/lib/uploadValidation";
import { revalidateCompetitionPublicPage } from "@/lib/revalidateCompetitionPublicPage";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await requireHostOrgAdminForCompetition(id, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json({ error: gated.error }, { status: gated.status });
      }
      throw e;
    }

    // ファイルを取得
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // ファイルサイズチェック (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateCompetitionAttachmentBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "competitions");
    const timestamp = Date.now();
    const ext = validated.value.ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const fileName = `${id}-${timestamp}-${randomUUID()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);
    let fileUrl = `/uploads/competitions/${fileName}`;
    if (canUseSupabaseStorage()) {
      try {
        fileUrl = await uploadPublicAsset({
          objectKey: `competitions/${fileName}`,
          body: buffer,
          contentType: validated.value.mime,
        });
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "ストレージへのアップロードに失敗しました。Supabase Storage の設定とバケット権限を確認してください。";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    } else {
      try {
        await mkdir(uploadDir, { recursive: true });
        await writeFile(filePath, buffer);
      } catch {
        return NextResponse.json(
          {
            error:
              "ファイルの保存に失敗しました。本番・サーバレス環境では Supabase Storage（SUPABASE_SERVICE_ROLE_KEY と SUPABASE_STORAGE_BUCKET）の設定が必要です。",
          },
          { status: 503 }
        );
      }
    }

    // データベースに保存
    const attachment = await prisma.competitionAttachment.create({
      data: {
        competitionId: id,
        fileName: file.name,
        fileUrl,
        fileSize: file.size,
        mimeType: validated.value.mime,
      },
    });

    revalidateCompetitionPublicPage(id);

    return NextResponse.json(attachment);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/attachments/route.ts", error);
  }
}
