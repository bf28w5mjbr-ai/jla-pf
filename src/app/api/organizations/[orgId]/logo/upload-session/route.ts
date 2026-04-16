import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  logoUploadExtensionFromFileName,
  requireOrgAdminForLogoUpload,
} from "@/lib/organizationLogoUploadServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseSupabaseStorage } from "@/lib/supabase/storage";
import { sanitizeSupabaseObjectKey } from "@/lib/supabase/storageKey";

export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;

    const auth = await requireOrgAdminForLogoUpload(request, orgId);
    if (!auth.ok) {
      return auth.response;
    }

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

    let fileName = "";
    try {
      const body = (await request.json()) as { fileName?: unknown };
      if (typeof body.fileName === "string") {
        fileName = body.fileName;
      }
    } catch {
      // 空ボディ可
    }

    const ext = logoUploadExtensionFromFileName(fileName);
    const stamp = Date.now();
    const nonce = randomBytes(4).toString("hex");
    const rawPath = `organizations/${orgId}-${stamp}-${nonce}.${ext}`;
    const objectPath = sanitizeSupabaseObjectKey(rawPath);

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath, { upsert: true });

    if (error || !data?.signedUrl || !data.token || !data.path) {
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
      path: data.path,
      token: data.token,
      bucket,
      /** クライアントが SDK 外で PUT する場合に利用可（主経路は path + token） */
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    return jsonInternalError500("POST api/organizations/[orgId]/logo/upload-session/route.ts", error);
  }
}
