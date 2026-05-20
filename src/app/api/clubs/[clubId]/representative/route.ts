import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../../lib/auth";
import { prisma } from "../../../../../server/db";
import { requireClubAdmin } from "../../../../../lib/accessControl";
import { Prisma } from "@prisma/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json(
        { error: "クラブの管理者のみが代表者を設定できます" },
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

    const membership = await prisma.membership.findFirst({
      where: {
        clubId,
        userId: representativeUserId,
        status: "APPROVED",
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "代表者は該当クラブの承認済みメンバーである必要があります" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: representativeUserId },
      select: {
        profile: {
          select: {
            familyName: true,
            givenName: true,
            familyNameKana: true,
            givenNameKana: true,
          },
        },
        address: true,
        contact: { select: { phoneNumber: true } },
      },
    });

    if (!user?.profile || !user.address || !user.contact) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const club = await prisma.club.update({
      where: { id: clubId },
      data: {
        representativeUserId,
        representativeFamilyName: user.profile.familyName,
        representativeGivenName: user.profile.givenName,
        representativeFamilyNameKana: user.profile.familyNameKana,
        representativeGivenNameKana: user.profile.givenNameKana,
        representativePostalCode: user.address.postalCode,
        representativePrefecture: user.address.prefecture,
        representativeCity: user.address.city,
        representativeAddressLine1: user.address.addressLine1,
        representativeAddressLine2: user.address.addressLine2,
        representativePhone: user.contact.phoneNumber,
      } as Prisma.ClubUncheckedUpdateInput,
      select: {
        id: true,
      },
    });

    return NextResponse.json({ message: "代表者を更新しました", club });
  } catch (error) {
    return jsonInternalError500("PUT api/clubs/[clubId]/representative/route.ts", error);
  }
}
