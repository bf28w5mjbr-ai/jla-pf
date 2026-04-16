import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";

const LOGO_FILENAME_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);

export function logoUploadExtensionFromFileName(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const e = m?.[1] ?? "png";
  if (e === "jpeg") return "jpg";
  return LOGO_FILENAME_EXT.has(e) ? e : "png";
}

/**
 * 署名付き直アップロード後の確定 API に渡される path の検証。
 */
export function isPendingDirectOrganizationLogoPath(path: string, orgId: string): boolean {
  const escaped = orgId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^organizations/${escaped}-\\d+-[a-f0-9]{8}\\.(png|jpg|jpeg|gif|webp|avif|svg)$`,
  );
  return re.test(path);
}

export async function requireOrgAdminForLogoUpload(
  request: NextRequest,
  orgId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      admins: {
        where: { userId: session.userId },
      },
    },
  });

  if (!organization) {
    return {
      ok: false,
      response: NextResponse.json({ error: "団体が見つかりません" }, { status: 404 }),
    };
  }

  if (!hasOrgAdminAccess(organization.admins)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ロゴをアップロードする権限がありません" },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}
