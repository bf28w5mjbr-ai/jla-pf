import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

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

    // 画像形式チェック
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // ファイル名を生成（ユーザーID + タイムスタンプ + 拡張子）
    const ext = file.name.split(".").pop();
    const filename = `${sess.userId}-${Date.now()}.${ext}`;
    
    // 保存先ディレクトリ
    const uploadDir = join(process.cwd(), "public", "uploads", "profiles");
    
    // ディレクトリが存在しない場合は作成
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // ファイルを保存
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // データベースを更新
    const photoUrl = `/uploads/profiles/${filename}`;
    await prisma.user.update({
      where: { id: sess.userId },
      data: { profilePhotoUrl: photoUrl },
    });

    return NextResponse.json({ url: photoUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    
    if (!sess?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // データベースを更新（URLをnullに設定）
    await prisma.user.update({
      where: { id: sess.userId },
      data: { profilePhotoUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
