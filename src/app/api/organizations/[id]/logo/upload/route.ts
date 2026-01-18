import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 団体とユーザーの権限を確認
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        admins: {
          where: { userId: session.userId },
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "団体が見つかりません" },
        { status: 404 }
      );
    }

    const userRole = organization.admins[0]?.role;
    if (!userRole || (userRole !== "OWNER" && userRole !== "ADMIN")) {
      return NextResponse.json(
        { error: "ロゴをアップロードする権限がありません" },
        { status: 403 }
      );
    }

    // FormDataからファイルを取得
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが選択されていません" },
        { status: 400 }
      );
    }

    // ファイルサイズチェック（5MB以下）
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "ファイルサイズは5MB以下にしてください" },
        { status: 400 }
      );
    }

    // ファイルタイプチェック
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "JPEG、PNG、WebP、GIF形式の画像のみアップロード可能です" },
        { status: 400 }
      );
    }

    // ファイル名を生成（組織ID + タイムスタンプ + 拡張子）
    const ext = file.name.split(".").pop();
    const fileName = `${id}-${Date.now()}.${ext}`;

    // 保存先ディレクトリを作成
    const uploadDir = join(process.cwd(), "public", "uploads", "organizations");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // ファイルを保存
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    // DBに保存されるURL
    const logoUrl = `/uploads/organizations/${fileName}`;

    // 団体情報を更新
    const updatedOrganization = await prisma.organization.update({
      where: { id },
      data: { logoUrl },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl: updatedOrganization.logoUrl,
    });
  } catch (error) {
    console.error("Upload logo error:", error);
    return NextResponse.json(
      { error: "ロゴのアップロードに失敗しました" },
      { status: 500 }
    );
  }
}
