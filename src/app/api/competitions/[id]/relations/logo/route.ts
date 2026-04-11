import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import {
  canUseSupabaseStorage,
  deletePublicAssetByUrl,
  uploadPublicAsset,
} from "@/lib/supabase/storage";
import { validateRasterImageBuffer } from "@/lib/uploadValidation";
import { normalizeRelationLogos } from "@/lib/relationLogos";

/** file-type / fs 利用のため Node ランタイムを明示 */
export const runtime = "nodejs";

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

    // 権限確認（管理者のみ）
    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json(
        { error: "編集権限がありません" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const typeRaw = formData.get("type");
    const nameRaw = formData.get("name");
    const type = typeof typeRaw === "string" ? typeRaw : "";
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }
    const file = fileEntry;

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateRasterImageBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const fileName = `${id}-${type}-${Date.now()}.${validated.value.ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "competitions");
    const filePath = join(uploadDir, fileName);
    const relativeLogoUrl = `/uploads/competitions/${fileName}`;

    let logoUrl: string;
    if (canUseSupabaseStorage()) {
      try {
        logoUrl = await uploadPublicAsset({
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
      const { mkdir } = await import("fs/promises");
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
      logoUrl = relativeLogoUrl;
    }

    // 既存のロゴデータを取得
    const field = type === "cooperator" ? "cooperatorsLogos" : "grantsLogos";
    const currentLogos = normalizeRelationLogos(
      type === "cooperator" ? competition.cooperatorsLogos : competition.grantsLogos,
    );

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
      name,
      logos: updatedLogos,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/relations/logo/route.ts", error);
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

    // 権限確認（管理者のみ）
    if (!hasOrgAdminAccess(competition.organization.admins)) {
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
    const currentLogos = normalizeRelationLogos(
      type === "cooperator" ? competition.cooperatorsLogos : competition.grantsLogos,
    );

    // ロゴを削除
    const updatedLogos = currentLogos.filter((logo) => logo.logoUrl !== logoUrl);

    // データベースを更新
    await prisma.competition.update({
      where: { id },
      data: {
        [field]: updatedLogos,
      },
    });

    // ファイルを削除
    try {
      if (logoUrl.startsWith("http")) {
        await deletePublicAssetByUrl(logoUrl);
      } else {
        const filePath = join(process.cwd(), "public", logoUrl);
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      }
    } catch (error) {
      console.error("File delete error:", error);
    }

    return NextResponse.json({
      message: "ロゴを削除しました",
    });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/relations/logo/route.ts", error);
  }
}
