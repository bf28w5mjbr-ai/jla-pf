import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 作成者の情報を取得（代表者情報として使用）
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        familyName: true,
        givenName: true,
        familyNameKana: true,
        givenNameKana: true,
        postalCode: true,
        prefecture: true,
        city: true,
        addressLine1: true,
        addressLine2: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const body = await request.json();
    const { 
      name, 
      nameKana,
      websiteUrl,
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

    // クラブを作成（代表者情報は作成者の情報を使用）
    const club = await prisma.club.create({
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        representativeFamilyName: user.familyName,
        representativeGivenName: user.givenName,
        representativeFamilyNameKana: user.familyNameKana,
        representativeGivenNameKana: user.givenNameKana,
        representativePostalCode: user.postalCode,
        representativePrefecture: user.prefecture,
        representativeCity: user.city,
        representativeAddressLine1: user.addressLine1,
        representativeAddressLine2: user.addressLine2,
        representativePhone: user.phoneNumber,
        patrolLocation: patrolLocation?.trim() || null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        officePostalCode: officePostalCode?.trim() || null,
        officePrefecture: officePrefecture?.trim() || null,
        officeCity: officeCity?.trim() || null,
        officeAddressLine1: officeAddressLine1?.trim() || null,
        officeAddressLine2: officeAddressLine2?.trim() || null,
        officePhone: officePhone?.trim() || null,
        mailingName: mailingName?.trim() || null,
        status: "APPLYING", // 申請中
        creatorId: session.userId,
      },
    });

    // 作成者を自動的にオーナーとして登録
    await prisma.membership.create({
      data: {
        userId: session.userId,
        clubId: club.id,
        role: "OWNER",
        status: "APPROVED", // オーナーは自動承認
      },
    });

    return NextResponse.json({
      message: "クラブを作成しました",
      club: {
        id: club.id,
        name: club.name,
        status: club.status,
      },
    });
  } catch (error) {
    console.error("Create club error:", error);
    return NextResponse.json(
      { error: "クラブの作成に失敗しました" },
      { status: 500 }
    );
  }
}
