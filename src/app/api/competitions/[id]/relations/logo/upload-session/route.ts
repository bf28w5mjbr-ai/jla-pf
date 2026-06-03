import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseSupabaseStorage } from "@/lib/supabase/storage";
import { sanitizeSupabaseObjectKey } from "@/lib/supabase/storageKey";
import {
  buildPendingCompetitionRelationLogoPath,
  parseCompetitionRelationRole,
  parseRelatedOrganizationId,
  relationLogoDisplayName,
  requireCompetitionLogoAdmin,
} from "@/lib/competitionRelationLogoUploadServer";

export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireCompetitionLogoAdmin(request, id);
    if (!auth.ok) return auth.response;

    if (!canUseSupabaseStorage()) {
      return NextResponse.json(
        { error: "直アップロードは利用できません", directUpload: false },
        { status: 503 },
      );
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    if (!bucket) {
      return NextResponse.json(
        { error: "直アップロードは利用できません", directUpload: false },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: unknown;
      name?: unknown;
      role?: unknown;
      fileName?: unknown;
    };
    const organizationId = parseRelatedOrganizationId(body.organizationId);
    const role = parseCompetitionRelationRole(body.role);
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const displayName = relationLogoDisplayName(body.name, fileName);

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId が必要です" }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json(
        { error: "名前が必要です（表示名を入力するか、拡張子付きのファイル名にしてください）" },
        { status: 400 },
      );
    }
    if (!role) {
      return NextResponse.json({ error: "属性が必要です" }, { status: 400 });
    }

    const objectPath = sanitizeSupabaseObjectKey(
      buildPendingCompetitionRelationLogoPath(id, organizationId, fileName),
    );

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath, { upsert: true });

    if (error || !data?.path || !data.token) {
      return NextResponse.json(
        {
          error:
            error?.message ??
            "アップロード用 URL の発行に失敗しました。しばらくしてから再度お試しください。",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      bucket,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/competitions/[id]/relations/logo/upload-session/route.ts",
      error,
    );
  }
}
