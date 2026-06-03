import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import {
  COMPETITION_RELATION_LOGO_MAX_BYTES,
  validateAndNormalizeCompetitionRelationLogoBuffer,
} from "@/lib/uploadValidation";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import {
  parseCompetitionRelationRole,
  parseRelatedOrganizationId,
  relationLogoDisplayName,
  requireCompetitionLogoAdmin,
  setRelatedOrganizationLogo,
} from "@/lib/competitionRelationLogoUploadServer";

const MAX_JSON_BODY_DECODED_BYTES = 3 * 1024 * 1024;

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireCompetitionLogoAdmin(request, id);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: unknown;
      name?: unknown;
      role?: unknown;
      fileBase64?: unknown;
      fileName?: unknown;
    };
    const organizationId = parseRelatedOrganizationId(body.organizationId);
    const role = parseCompetitionRelationRole(body.role);
    const fileBase64Raw = typeof body.fileBase64 === "string" ? body.fileBase64.trim() : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const displayName = relationLogoDisplayName(body.name, fileName || "logo.png");

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
    if (!fileBase64Raw) {
      return NextResponse.json({ error: "fileBase64 が空です" }, { status: 400 });
    }

    const comma = fileBase64Raw.indexOf(",");
    const fileBase64 =
      fileBase64Raw.startsWith("data:") && comma !== -1
        ? fileBase64Raw.slice(comma + 1).trim()
        : fileBase64Raw;

    let inputBuffer: Buffer;
    try {
      inputBuffer = Buffer.from(fileBase64, "base64");
    } catch {
      return NextResponse.json({ error: "Base64 の解釈に失敗しました" }, { status: 400 });
    }

    if (inputBuffer.length === 0) {
      return NextResponse.json({ error: "ファイルが空です" }, { status: 400 });
    }
    if (inputBuffer.length > MAX_JSON_BODY_DECODED_BYTES) {
      return NextResponse.json(
        { error: "この経路では 3MB 以下の画像のみアップロードできます" },
        { status: 413 },
      );
    }
    if (inputBuffer.length > COMPETITION_RELATION_LOGO_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `ファイルサイズは ${Math.floor(COMPETITION_RELATION_LOGO_MAX_BYTES / (1024 * 1024))}MB 以下にしてください`,
        },
        { status: 400 },
      );
    }

    const validated = await validateAndNormalizeCompetitionRelationLogoBuffer(inputBuffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const fileNameForStore = `${id}-relation-${organizationId.slice(0, 32)}-${Date.now()}.${validated.value.ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "competitions");
    const filePath = join(uploadDir, fileNameForStore);
    const relativeLogoUrl = `/uploads/competitions/${fileNameForStore}`;

    let logoUrl: string;
    if (canUseSupabaseStorage()) {
      logoUrl = await uploadPublicAsset({
        objectKey: `competitions/${fileNameForStore}`,
        body: validated.value.buffer,
        contentType: validated.value.mime,
      });
    } else {
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }
      await writeFile(filePath, validated.value.buffer);
      logoUrl = relativeLogoUrl;
    }

    const saved = await setRelatedOrganizationLogo({
      competitionId: id,
      organizationId,
      logoUrl,
      name: displayName,
      role,
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
    return jsonInternalError500(
      "POST api/competitions/[id]/relations/logo/upload-json/route.ts",
      error,
    );
  }
}
