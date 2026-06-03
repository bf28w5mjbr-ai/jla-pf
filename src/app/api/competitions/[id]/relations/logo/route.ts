import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
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
import {
  clearRelatedOrganizationLogo,
  parseCompetitionRelationRole,
  parseRelatedOrganizationId,
  relationLogoDisplayName,
  requireCompetitionLogoAdmin,
  setRelatedOrganizationLogo,
} from "@/lib/competitionRelationLogoUploadServer";

/** file-type / fs 利用のため Node ランタイムを明示 */
export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireCompetitionLogoAdmin(request, id);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const organizationId = parseRelatedOrganizationId(formData.get("organizationId"));
    const nameRaw = formData.get("name");
    const role = parseCompetitionRelationRole(formData.get("role"));

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }
    const file = fileEntry;

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId が必要です" }, { status: 400 });
    }

    const displayName = relationLogoDisplayName(nameRaw, file.name);
    if (!displayName) {
      return NextResponse.json(
        {
          error:
            "名前が必要です（表示名を入力するか、拡張子付きのファイル名にしてください）",
        },
        { status: 400 },
      );
    }

    if (file.size > COMPETITION_RELATION_LOGO_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `ファイルサイズは ${Math.floor(COMPETITION_RELATION_LOGO_MAX_BYTES / (1024 * 1024))}MB 以下にしてください`,
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateAndNormalizeCompetitionRelationLogoBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const outBuffer = validated.value.buffer;
    const fileName = `${id}-relation-${organizationId.slice(0, 32)}-${Date.now()}.${validated.value.ext}`;
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
          { status: 503 },
        );
      }
      logoUrl = relativeLogoUrl;
    }

    const saved = await setRelatedOrganizationLogo({
      competitionId: id,
      organizationId,
      logoUrl,
      name: displayName,
      role: role ?? undefined,
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      ...saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アップロードに失敗しました";
    if (message.includes("組織が見つかりません")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return jsonInternalError500("POST api/competitions/[id]/relations/logo/route.ts", error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { searchParams } = new URL(request.url);
    const organizationId = parseRelatedOrganizationId(searchParams.get("organizationId"));

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId が必要です" }, { status: 400 });
    }

    const cleared = await clearRelatedOrganizationLogo({
      competitionId: id,
      organizationId,
    });

    try {
      if (cleared.logoUrl.startsWith("http")) {
        await deletePublicAssetByUrl(cleared.logoUrl);
      } else {
        const filePath = join(process.cwd(), "public", cleared.logoUrl);
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      }
    } catch (error) {
      console.error("File delete error:", error);
    }

    return NextResponse.json({
      message: "ロゴを削除しました",
      relatedOrganizations: cleared.relatedOrganizations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "削除に失敗しました";
    if (message.includes("見つかりません")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return jsonInternalError500("DELETE api/competitions/[id]/relations/logo/route.ts", error);
  }
}
