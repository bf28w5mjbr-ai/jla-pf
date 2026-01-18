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
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      nameKana,
      abbreviation,
      websiteUrl,
      email,
      phoneNumber,
      postalCode,
      prefecture,
      city,
      addressLine1,
      addressLine2,
      description,
      establishedYear,
    } = body;

    // バリデーション
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "団体名は必須です" },
        { status: 400 }
      );
    }

    // 団体を作成（代表者情報は作成者の情報を使用）
    const organization = await prisma.organization.create({
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        email: email?.trim() || null,
        phoneNumber: phoneNumber?.trim() || null,
        representativeFamilyName: user.familyName,
        representativeGivenName: user.givenName,
        representativeFamilyNameKana: user.familyNameKana,
        representativeGivenNameKana: user.givenNameKana,
        postalCode: postalCode?.trim() || null,
        prefecture: prefecture?.trim() || null,
        city: city?.trim() || null,
        addressLine1: addressLine1?.trim() || null,
        addressLine2: addressLine2?.trim() || null,
        description: description?.trim() || null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        status: "PENDING",
        createdById: session.userId,
      },
    });

    // 作成者を自動的にOWNERとして追加
    await prisma.orgAdmin.create({
      data: {
        userId: session.userId,
        organizationId: organization.id,
        role: "OWNER",
      },
    });

    return NextResponse.json(organization);
  } catch (error) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: "団体の作成に失敗しました" },
      { status: 500 }
    );
  }
}
