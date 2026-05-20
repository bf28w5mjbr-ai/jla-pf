import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import {
  canUseSupabaseStorage,
  deletePublicAssetByUrl,
  uploadPublicAsset,
} from "@/lib/supabase/storage";
import {
  COMPETITION_RELATION_LOGO_MAX_BYTES,
  validateAndNormalizeCompetitionRelationLogoBuffer,
} from "@/lib/uploadValidation";
import { normalizeRelationLogos } from "@/lib/relationLogos";
import {
  appendCompetitionRelationLogo,
  parseCompetitionRelationLogoType,
  relationLogoDisplayName,
  requireCompetitionLogoAdmin,
} from "@/lib/competitionRelationLogoUploadServer";

/** file-type / fs 利用のため Node ランタイムを明示 */
export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireCompetitionLogoAdmin(request, id);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const typeRaw = parseCompetitionRelationLogoType(formData.get("type"));
    const nameRaw = formData.get("name");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }
    const file = fileEntry;

    if (!typeRaw) {
      return NextResponse.json({ error: "無効なタイプです" }, { status: 400 });
    }
    const type = typeRaw;

    const displayName = relationLogoDisplayName(nameRaw, file.name);
    if (!displayName) {
      return NextResponse.json({ error: "名前が必要です（表示名を入力するか、拡張子付きのファイル名にしてください）" }, { status: 400 });
    }

    if (file.size > COMPETITION_RELATION_LOGO_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `ファイルサイズは ${Math.floor(COMPETITION_RELATION_LOGO_MAX_BYTES / (1024 * 1024))}MB 以下にしてください`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateAndNormalizeCompetitionRelationLogoBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const outBuffer = validated.value.buffer;
    const fileName = `${id}-${type}-${Date.now()}.${validated.value.ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "competitions");
    const filePath = join(uploadDir, fileName);
    const relativeLogoUrl = `/uploads/competitions/${fileName}`;

    let logoUrl: string;
    if (canUseSupabaseStorage()) {
      try {
        logoUrl = await uploadPublicAsset({
          objectKey: `competitions/${fileName}`,
          body: outBuffer,
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
        await writeFile(filePath, outBuffer);
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

    const saved = await appendCompetitionRelationLogo({
      competitionId: id,
      type,
      displayName,
      logoUrl,
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      ...saved,
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

    try {
      await requireHostOrgAdminForCompetition(id, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json({ error: gated.error }, { status: gated.status });
      }
      throw e;
    }

    const competition = await prisma.competition.findUnique({
      where: { id },
      select: {
        id: true,
        cooperatorsLogos: true,
        grantsLogos: true,
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
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
