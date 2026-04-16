import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import {
  COMPETITION_RELATION_LOGO_MAX_BYTES,
  validateAndNormalizeCompetitionRelationLogoBuffer,
} from "@/lib/uploadValidation";
import {
  appendCompetitionRelationLogo,
  isPendingCompetitionRelationLogoPath,
  parseCompetitionRelationLogoType,
  relationLogoDisplayName,
  requireCompetitionLogoAdmin,
} from "@/lib/competitionRelationLogoUploadServer";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireCompetitionLogoAdmin(request, id);
    if (!auth.ok) return auth.response;

    if (!canUseSupabaseStorage()) {
      return NextResponse.json({ error: "ストレージが未設定です" }, { status: 503 });
    }
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    if (!bucket) {
      return NextResponse.json({ error: "ストレージが未設定です" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: unknown;
      name?: unknown;
      path?: unknown;
    };
    const type = parseCompetitionRelationLogoType(body.type);
    const path = typeof body.path === "string" ? body.path : "";
    const fileName = path.split("/").at(-1) ?? "";
    const displayName = relationLogoDisplayName(body.name, fileName);

    if (!type) {
      return NextResponse.json({ error: "無効なタイプです" }, { status: 400 });
    }
    if (!path || !isPendingCompetitionRelationLogoPath(path, id, type)) {
      return NextResponse.json({ error: "無効なパスです" }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json(
        { error: "名前が必要です（表示名を入力するか、拡張子付きのファイル名にしてください）" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(path);
    if (dlError || !blob) {
      return NextResponse.json(
        { error: "アップロード済みファイルを取得できませんでした" },
        { status: 400 },
      );
    }

    const inputBuffer = Buffer.from(await blob.arrayBuffer());
    if (inputBuffer.length > COMPETITION_RELATION_LOGO_MAX_BYTES) {
      await supabase.storage.from(bucket).remove([path]);
      return NextResponse.json(
        {
          error: `ファイルサイズは ${Math.floor(COMPETITION_RELATION_LOGO_MAX_BYTES / (1024 * 1024))}MB 以下にしてください`,
        },
        { status: 400 },
      );
    }

    const validated = await validateAndNormalizeCompetitionRelationLogoBuffer(inputBuffer);
    if (!validated.ok) {
      await supabase.storage.from(bucket).remove([path]);
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const finalFileName = `${id}-${type}-${Date.now()}.${validated.value.ext}`;
    const logoUrl = await uploadPublicAsset({
      objectKey: `competitions/${finalFileName}`,
      body: validated.value.buffer,
      contentType: validated.value.mime,
    });

    await supabase.storage.from(bucket).remove([path]);

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
    return jsonInternalError500(
      "POST api/competitions/[id]/relations/logo/upload-complete/route.ts",
      error,
    );
  }
}
