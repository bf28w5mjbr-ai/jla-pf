import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  canUseSupabaseStorage,
  deletePublicAssetByUrl,
  uploadPublicAsset,
} from "@/lib/supabase/storage";
import { validateRasterImageBuffer } from "@/lib/uploadValidation";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    
    if (!sess?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateRasterImageBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const filename = `${sess.userId}-${Date.now()}.${validated.value.ext}`;
    
    // 保存先ディレクトリ
    const uploadDir = join(process.cwd(), "public", "uploads", "profiles");
    
    // ディレクトリが存在しない場合は作成
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filepath = join(uploadDir, filename);
    let photoUrl = `/uploads/profiles/${filename}`;
    if (canUseSupabaseStorage()) {
      photoUrl = await uploadPublicAsset({
        objectKey: `profiles/${filename}`,
        body: buffer,
        contentType: validated.value.mime,
      });
    } else {
      await writeFile(filepath, buffer);
    }

    // データベースを更新
    await prisma.user.update({
      where: { id: sess.userId },
      data: { profilePhotoUrl: photoUrl },
    });

    return NextResponse.json({ url: photoUrl });
  } catch (error) {
    return jsonInternalError500("POST api/upload/profile-photo/route.ts", error);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    
    if (!sess?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const current = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { profilePhotoUrl: true },
    });
    if (current?.profilePhotoUrl?.startsWith("http")) {
      await deletePublicAssetByUrl(current.profilePhotoUrl);
    }

    // データベースを更新（URLをnullに設定）
    await prisma.user.update({
      where: { id: sess.userId },
      data: { profilePhotoUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/upload/profile-photo/route.ts", error);
  }
}
