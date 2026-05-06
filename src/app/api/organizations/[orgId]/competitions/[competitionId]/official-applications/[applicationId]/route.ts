import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

export async function DELETE(
  _req: NextRequest,
  context: {
    params: Promise<{
      orgId: string;
      competitionId: string;
      applicationId: string;
    }>;
  }
) {
  try {
    const { orgId: organizationId, competitionId, applicationId } = await context.params;
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

    const application = await prisma.competitionOfficialApplication.findFirst({
      where: {
        id: applicationId,
        competitionId,
        competition: { organizationId },
      },
      select: { id: true, userId: true },
    });

    if (!application) {
      return NextResponse.json({ error: "応募が見つかりません" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.competitionOfficialAttendance.deleteMany({
        where: {
          competitionId,
          userId: application.userId,
        },
      }),
      prisma.competitionTechnicalOfficialAssignment.deleteMany({
        where: {
          competitionId,
          userId: application.userId,
          invitationId: null,
        },
      }),
      prisma.competitionOfficialApplication.delete({
        where: { id: application.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    return jsonInternalError500(
      "DELETE api/organizations/[orgId]/competitions/[competitionId]/official-applications/[applicationId]/route.ts",
      e
    );
  }
}
