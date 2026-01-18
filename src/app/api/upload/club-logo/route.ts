import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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

    // クラブの存在確認とメンバーシップ確認
    const membership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        }
      },
      include: {
        club: true,
      }
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: "クラブのオーナーまたは管理者のみがロゴを変更できます" },
        { status: 403 }
      );
    }

    // ファイル保存
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // uploads/clubs ディレクトリを作成 (存在しない場合)
    const uploadDir = path.join(process.cwd(), "public", "uploads", "clubs");
    await mkdir(uploadDir, { recursive: true });

    // ファイル名を生成 (タイムスタンプ + 元のファイル名)
    const timestamp = Date.now();
    const originalName = file.name.replace(/\s+/g, "_");
    const filename = `${timestamp}-${originalName}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    // DBを更新
    const logoUrl = `/uploads/clubs/${filename}`;
    await prisma.club.update({
      where: { id: clubId },
      data: { logoUrl },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl,
    });
  } catch (error) {
    console.error("Club logo upload error:", error);
    return NextResponse.json(
      { error: "ロゴのアップロードに失敗しました" },
      { status: 500 }
    );
  }
}
