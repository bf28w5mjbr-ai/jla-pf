import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireClubAdmin } from "@/lib/accessControl";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import { validateRasterImageBuffer } from "@/lib/uploadValidation";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const clubId = formData.get("clubId") as string;

    if (!file || !clubId) {
      return NextResponse.json({ error: "ファイルとクラブIDが必要です" }, { status: 400 });
    }

    // クラブ管理者権限チェック
    try {
      await requireClubAdmin(clubId, sess.userId);
    } catch {
      return NextResponse.json(
        { error: "クラブの管理者のみがロゴを変更できます" },
        { status: 403 }
      );
    }

    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "ファイルサイズは8MB以下にしてください" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateRasterImageBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "clubs");
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const ext = validated.value.ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const filename = `${timestamp}-${randomUUID()}.${ext}`;
    const filepath = path.join(uploadDir, filename);
    let logoUrl = `/uploads/clubs/${filename}`;
    if (canUseSupabaseStorage()) {
      logoUrl = await uploadPublicAsset({
        objectKey: `clubs/${filename}`,
        body: buffer,
        contentType: validated.value.mime,
      });
    } else {
      await writeFile(filepath, buffer);
    }

    // DBを更新
    await prisma.club.update({
      where: { id: clubId },
      data: { logoUrl },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl,
    });
  } catch (error) {
    return jsonInternalError500("POST api/upload/club-logo/route.ts", error);
  }
}
