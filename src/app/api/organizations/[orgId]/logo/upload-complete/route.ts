import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import {
  isPendingDirectOrganizationLogoPath,
  requireOrgAdminForLogoUpload,
} from "@/lib/organizationLogoUploadServer";
import { prisma } from "@/server/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseSupabaseStorage } from "@/lib/supabase/storage";
import { validateOrganizationLogoBuffer } from "@/lib/uploadValidation";

export const maxDuration = 60;

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
      return NextResponse.json({ error: "ストレージが未設定です" }, { status: 503 });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    if (!bucket) {
      return NextResponse.json({ error: "ストレージが未設定です" }, { status: 503 });
    }

    let objectPath = "";
    try {
      const body = (await request.json()) as { path?: unknown };
      if (typeof body.path === "string") {
        objectPath = body.path;
      }
    } catch {
      return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
    }

    if (!objectPath || !isPendingDirectOrganizationLogoPath(objectPath, orgId)) {
      return NextResponse.json({ error: "無効なパスです" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(objectPath);

    if (dlError || !blob) {
      return NextResponse.json(
        { error: "アップロード済みファイルを取得できませんでした" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const maxSize = 8 * 1024 * 1024;
    if (buffer.length > maxSize) {
      await supabase.storage.from(bucket).remove([objectPath]);
      return NextResponse.json(
        { error: "ファイルサイズは8MB以下にしてください" },
        { status: 400 },
      );
    }

    const validated = await validateOrganizationLogoBuffer(buffer);
    if (!validated.ok) {
      await supabase.storage.from(bucket).remove([objectPath]);
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    const logoUrl = pub.publicUrl;
    if (!logoUrl) {
      return NextResponse.json({ error: "公開 URL の取得に失敗しました" }, { status: 502 });
    }

    const updatedOrganization = await prisma.organization.update({
      where: { id: orgId },
      data: { logoUrl },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl: updatedOrganization.logoUrl,
    });
  } catch (error) {
    return jsonInternalError500("POST api/organizations/[orgId]/logo/upload-complete/route.ts", error);
  }
}
