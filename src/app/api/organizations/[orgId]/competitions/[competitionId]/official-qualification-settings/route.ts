export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function PUT(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      officialQualificationFilterEnabled?: unknown;
      officialRecruitmentEnabled?: unknown;
      startListPubliclyVisible?: unknown;
    };
    const hasFilterFlag = typeof body.officialQualificationFilterEnabled === "boolean";
    const hasRecruitmentFlag = typeof body.officialRecruitmentEnabled === "boolean";
    const hasStartListPublicFlag = typeof body.startListPubliclyVisible === "boolean";
    if (!hasFilterFlag && !hasRecruitmentFlag && !hasStartListPublicFlag) {
      return NextResponse.json(
        { error: "更新対象の設定値が不正です" },
        { status: 400 }
      );
    }

    const existing = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        ...(hasFilterFlag
          ? { officialQualificationFilterEnabled: body.officialQualificationFilterEnabled as boolean }
          : {}),
        ...(hasRecruitmentFlag
          ? { officialRecruitmentEnabled: body.officialRecruitmentEnabled as boolean }
          : {}),
        ...(hasStartListPublicFlag
          ? { startListPubliclyVisible: body.startListPubliclyVisible as boolean }
          : {}),
      },
      select: {
        id: true,
        officialQualificationFilterEnabled: true,
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        startListPubliclyVisible: true,
      },
    });

    return NextResponse.json({ success: true, competition: updated });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/organizations/[orgId]/competitions/[competitionId]/official-qualification-settings/route.ts",
      error
    );
  }
}
