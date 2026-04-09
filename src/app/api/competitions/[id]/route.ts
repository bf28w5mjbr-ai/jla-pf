import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "大会が見つかりません" },
        { status: 404 }
      );
    }

    const isPublished =
      competition.status === "PUBLISHED" || competition.isPublished;
    if (!isPublished) {
      const token = request.cookies.get("session")?.value;
      const session = token ? await verifySession(token) : null;
      if (!session?.userId) {
        return NextResponse.json(
          { error: "大会が見つかりません" },
          { status: 404 }
        );
      }
      try {
        await requireOrgAdmin(competition.organizationId, session.userId);
      } catch {
        return NextResponse.json(
          { error: "大会が見つかりません" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ competition });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/route.ts", error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "大会が見つかりません" },
        { status: 404 }
      );
    }

    try {
      await requireOrgAdmin(competition.organizationId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "大会を削除する権限がありません" },
        { status: 403 }
      );
    }

    await prisma.competition.delete({
      where: { id: competition.id },
    });

    return NextResponse.json({ message: "大会を削除しました" });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/route.ts", error);
  }
}
