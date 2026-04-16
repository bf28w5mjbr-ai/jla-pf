import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { requireOrgAdminForLogoUpload } from "@/lib/organizationLogoUploadServer";
import { prisma } from "@/server/db";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import { validateOrganizationLogoBuffer } from "@/lib/uploadValidation";

/** multipart が中間で落ちる環境向け。Base64 膨張を踏まえ JSON 上限を抑える（Vercel のボディ上限付近で切れないように） */
const MAX_JSON_BODY_DECODED_BYTES = 3 * 1024 * 1024;

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

    let fileBase64 = "";
    try {
      const body = (await request.json()) as { fileBase64?: unknown };
      if (typeof body.fileBase64 === "string") {
        fileBase64 = body.fileBase64.trim();
      }
    } catch {
      return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
    }

    if (!fileBase64) {
      return NextResponse.json({ error: "fileBase64 が空です" }, { status: 400 });
    }

    const comma = fileBase64.indexOf(",");
    if (fileBase64.startsWith("data:") && comma !== -1) {
      fileBase64 = fileBase64.slice(comma + 1).trim();
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, "base64");
    } catch {
      return NextResponse.json({ error: "Base64 の解釈に失敗しました" }, { status: 400 });
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: "ファイルが空です" }, { status: 400 });
    }

    if (buffer.length > MAX_JSON_BODY_DECODED_BYTES) {
      return NextResponse.json(
        { error: "この経路では 3MB 以下の画像のみアップロードできます" },
        { status: 413 },
      );
    }

    const validated = await validateOrganizationLogoBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const { mime: contentType, ext: safeExt } = validated.value;
    const fileName = `${orgId}-${Date.now()}.${safeExt}`;

    const uploadDir = join(process.cwd(), "public", "uploads", "organizations");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    let logoUrl = `/uploads/organizations/${fileName}`;

    if (canUseSupabaseStorage()) {
      logoUrl = await uploadPublicAsset({
        objectKey: `organizations/${fileName}`,
        body: buffer,
        contentType,
      });
    } else {
      const filePath = join(uploadDir, fileName);
      await writeFile(filePath, buffer);
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
    return jsonInternalError500("POST api/organizations/[orgId]/logo/upload-json/route.ts", error);
  }
}
