import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { deletePublicAssetByUrl } from "@/lib/supabase/storage";
import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { join } from "path";
import {
  collectRemovedLogoUrls,
  normalizeRelatedOrganizations,
  validateRelatedOrganizationsPayload,
} from "@/lib/competitionRelatedOrganizations";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

async function deleteLogoFile(logoUrl: string): Promise<void> {
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
}

export async function PUT(
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

    const body = await request.json();
    const validated = validateRelatedOrganizationsPayload(body.relatedOrganizations);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const existing = await prisma.competition.findUnique({
      where: { id },
      select: { relatedOrganizations: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const previous = normalizeRelatedOrganizations(existing.relatedOrganizations);
    const removedLogoUrls = collectRemovedLogoUrls(previous, validated.organizations);

    const updatedCompetition = await prisma.competition.update({
      where: { id },
      data: { relatedOrganizations: validated.organizations },
    });

    for (const logoUrl of removedLogoUrls) {
      await deleteLogoFile(logoUrl);
    }

    return NextResponse.json({
      message: "関係組織情報を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/relations/route.ts", error);
  }
}
