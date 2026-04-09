import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{
      orgId: string;
      competitionId: string;
      applicationId: string;
    }>;
  }
) {
  try {
    const { orgId: organizationId, competitionId, applicationId } =
      await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    const status = body?.status;
    if (status !== "APPROVED" && status !== "REJECTED") {
      return NextResponse.json({ error: "ステータスが不正です" }, { status: 400 });
    }

    const application = await prisma.competitionOfficialApplication.findFirst({
      where: {
        id: applicationId,
        competitionId,
        competition: { organizationId },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "応募が見つかりません" }, { status: 404 });
    }
    if (application.status !== "PENDING") {
      return NextResponse.json({ error: "すでに処理済みです" }, { status: 400 });
    }

    await prisma.competitionOfficialApplication.update({
      where: { id: applicationId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedByUserId: session.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return jsonInternalError500("PATCH api/organizations/[orgId]/competitions/[competitionId]/official-applications/[applicationId]/route.ts", e);
  }
}
