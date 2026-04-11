import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import {
  sanitizeUploadBasename,
  validateCompetitionAttachmentBuffer,
} from "@/lib/uploadValidation";

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

    // 大会と権限チェック
    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "Competition not found" },
        { status: 404 }
      );
    }

    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const base = sanitizeUploadBasename(file.name);
    const fileName = `${id}-${timestamp}-${base}.${validated.value.ext}`;
    const filePath = path.join(uploadDir, fileName);
    let fileUrl = `/uploads/competitions/${fileName}`;
    if (canUseSupabaseStorage()) {
      fileUrl = await uploadPublicAsset({
        objectKey: `competitions/${fileName}`,
        body: buffer,
        contentType: validated.value.mime,
      });
    } else {
      await writeFile(filePath, buffer);
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

    return NextResponse.json(attachment);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/attachments/route.ts", error);
  }
}
