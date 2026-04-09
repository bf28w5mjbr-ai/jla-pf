import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;

    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json(
        { message: "競技会が見つかりません" },
        { status: 404 }
      );
    }

    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId && isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json(
        { message: "この操作を実行する権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { participantEligibilityText } = body as {
      participantEligibilityText?: unknown;
    };

    if (
      participantEligibilityText !== undefined &&
      participantEligibilityText !== null &&
      typeof participantEligibilityText !== "string"
    ) {
      return NextResponse.json(
        { message: "参加対象者の形式が正しくありません" },
        { status: 400 }
      );
    }

    const normalizedText =
      typeof participantEligibilityText === "string"
        ? participantEligibilityText.trim()
        : null;

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: {
        participantEligibilityText: normalizedText ? normalizedText : null,
      },
      select: {
        participantEligibilityText: true,
      },
    });

    return NextResponse.json({
      participantEligibilityText: updated.participantEligibilityText,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/participant-eligibility/route.ts", error);
  }
}
