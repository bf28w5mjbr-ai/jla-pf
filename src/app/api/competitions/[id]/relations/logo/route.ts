import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 大会情報を取得
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
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    // 権限確認（OWNER または ADMIN）
    const userRole = competition.organization.admins[0]?.role;
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "編集権限がありません" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // "cooperator" or "grant"
    const name = formData.get("name") as string;

    if (!file) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }

    if (!type || (type !== "cooperator" && type !== "grant")) {
      return NextResponse.json({ error: "無効なタイプです" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "名前が必要です" }, { status: 400 });
    }

    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ファイルサイズは5MB以下にしてください" },
        { status: 400 }
      );
    }

    // ファイルタイプチェック
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "画像ファイル（JPEG、PNG、WebP、GIF）のみアップロード可能です" },
        { status: 400 }
      );
    }

    // ファイルを保存
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop();
    const fileName = `${id}-${type}-${Date.now()}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "competitions");
    
    // ディレクトリがなければ作成
    const { mkdir } = await import("fs/promises");
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    const logoUrl = `/uploads/competitions/${fileName}`;

    // 既存のロゴデータを取得
    const field = type === "cooperator" ? "cooperatorsLogos" : "grantsLogos";
    const currentLogos = (competition[field] as any) || [];
    
    // 新しいロゴを追加
    const updatedLogos = [...currentLogos, { name, logoUrl }];

    // データベースを更新
    await prisma.competition.update({
      where: { id },
      data: {
        [field]: updatedLogos,
      },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl,
    });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json(
      { error: "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 大会情報を取得
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
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    // 権限確認（OWNER または ADMIN）
    const userRole = competition.organization.admins[0]?.role;
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "編集権限がありません" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "cooperator" or "grant"
    const logoUrl = searchParams.get("logoUrl");

    if (!type || (type !== "cooperator" && type !== "grant")) {
      return NextResponse.json({ error: "無効なタイプです" }, { status: 400 });
    }

    if (!logoUrl) {
      return NextResponse.json({ error: "ロゴURLが必要です" }, { status: 400 });
    }

    // 既存のロゴデータを取得
    const field = type === "cooperator" ? "cooperatorsLogos" : "grantsLogos";
    const currentLogos = (competition[field] as any) || [];
    
    // ロゴを削除
    const updatedLogos = currentLogos.filter((logo: any) => logo.logoUrl !== logoUrl);

    // データベースを更新
    await prisma.competition.update({
      where: { id },
      data: {
        [field]: updatedLogos,
      },
    });

    // ファイルを削除
    try {
      const filePath = join(process.cwd(), "public", logoUrl);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (error) {
      console.error("File delete error:", error);
    }

    return NextResponse.json({
      message: "ロゴを削除しました",
    });
  } catch (error) {
    console.error("Logo delete error:", error);
    return NextResponse.json(
      { error: "削除に失敗しました" },
      { status: 500 }
    );
  }
}
