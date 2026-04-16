import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { requireOrgAdminForLogoUpload } from "@/lib/organizationLogoUploadServer";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import { validateOrganizationLogoBuffer } from "@/lib/uploadValidation";

/** 画像検証・Supabase 転送で既定の短い上限を超えやすい（Vercel 等） */
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    const auth = await requireOrgAdminForLogoUpload(request, orgId);
    if (!auth.ok) {
      return auth.response;
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

    const maxSize = 8 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "ファイルサイズは8MB以下にしてください" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateOrganizationLogoBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const { mime: contentType, ext: safeExt } = validated.value;
    const fileName = `${orgId}-${Date.now()}.${safeExt}`;

    // 保存先ディレクトリを作成
    const uploadDir = join(process.cwd(), "public", "uploads", "organizations");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // ファイルを保存
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

    // 団体情報を更新
    const updatedOrganization = await prisma.organization.update({
      where: { id: orgId },
      data: { logoUrl },
    });

    return NextResponse.json({
      message: "ロゴをアップロードしました",
      logoUrl: updatedOrganization.logoUrl,
    });
  } catch (error) {
    return jsonInternalError500("POST api/organizations/[orgId]/logo/upload/route.ts", error);
  }
}
