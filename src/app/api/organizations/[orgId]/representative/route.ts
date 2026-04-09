import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../../lib/auth";
import { prisma } from "../../../../../server/db";
import { requireOrgAdmin } from "../../../../../lib/accessControl";
import { Prisma } from "@prisma/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(orgId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "団体の管理者のみが代表者を設定できます" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { representativeUserId } = body;

    if (!representativeUserId) {
      return NextResponse.json(
        { error: "representativeUserId が必要です" },
        { status: 400 }
      );
    }

    const admin = await prisma.orgAdmin.findFirst({
      where: {
        organizationId: orgId,
        userId: representativeUserId,
      },
      select: { id: true },
    });

    if (!admin) {
      return NextResponse.json(
        { error: "代表者は該当団体の管理者である必要があります" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: representativeUserId },
      select: {
        familyName: true,
        givenName: true,
        familyNameKana: true,
        givenNameKana: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const organization = await prisma.organization.update({
      where: { id: orgId },
      data: {
        representativeUserId,
        representativeFamilyName: user.familyName,
        representativeGivenName: user.givenName,
        representativeFamilyNameKana: user.familyNameKana,
        representativeGivenNameKana: user.givenNameKana,
      } as Prisma.OrganizationUncheckedUpdateInput,
      select: {
        id: true,
      },
    });

    return NextResponse.json({ message: "代表者を更新しました", organization });
  } catch (error) {
    return jsonInternalError500("PUT api/organizations/[orgId]/representative/route.ts", error);
  }
}
