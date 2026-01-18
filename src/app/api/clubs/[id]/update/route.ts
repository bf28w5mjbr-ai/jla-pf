import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const clubId = id;

    // オーナーまたは管理者かチェック
    const membership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        }
      }
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: "クラブのオーナーまたは管理者のみが編集できます" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { 
      name, 
      nameKana,
      websiteUrl,
      representativeFamilyName,
      representativeGivenName,
      representativeFamilyNameKana,
      representativeGivenNameKana,
      representativePostalCode,
      representativePrefecture,
      representativeCity,
      representativeAddressLine1,
      representativeAddressLine2,
      representativePhone,
      patrolLocation,
      establishedYear,
      officePostalCode,
      officePrefecture,
      officeCity,
      officeAddressLine1,
      officeAddressLine2,
      officePhone,
      mailingName,
    } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "クラブ名は必須です" }, { status: 400 });
    }

    // クラブ情報を更新
    const club = await prisma.club.update({
      where: { id: clubId },
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        representativeFamilyName: representativeFamilyName?.trim() || null,
        representativeGivenName: representativeGivenName?.trim() || null,
        representativeFamilyNameKana: representativeFamilyNameKana?.trim() || null,
        representativeGivenNameKana: representativeGivenNameKana?.trim() || null,
        representativePostalCode: representativePostalCode?.trim() || null,
        representativePrefecture: representativePrefecture?.trim() || null,
        representativeCity: representativeCity?.trim() || null,
        representativeAddressLine1: representativeAddressLine1?.trim() || null,
        representativeAddressLine2: representativeAddressLine2?.trim() || null,
        representativePhone: representativePhone?.trim() || null,
        patrolLocation: patrolLocation?.trim() || null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        officePostalCode: officePostalCode?.trim() || null,
        officePrefecture: officePrefecture?.trim() || null,
        officeCity: officeCity?.trim() || null,
        officeAddressLine1: officeAddressLine1?.trim() || null,
        officeAddressLine2: officeAddressLine2?.trim() || null,
        officePhone: officePhone?.trim() || null,
        mailingName: mailingName?.trim() || null,
      },
    });

    return NextResponse.json({
      message: "クラブ情報を更新しました",
      club,
    });
  } catch (error) {
    console.error("Update club error:", error);
    return NextResponse.json(
      { error: "クラブ情報の更新に失敗しました" },
      { status: 500 }
    );
  }
}
