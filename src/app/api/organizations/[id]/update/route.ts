import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const params = await context.params;
    const organizationId = params.id;

    // OWNER/ADMINかチェック
    const adminRole = await prisma.orgAdmin.findFirst({
      where: {
        organizationId,
        userId: session.userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });

    if (!adminRole) {
      return NextResponse.json(
        { error: "団体の編集権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      nameKana,
      abbreviation,
      websiteUrl,
      email,
      phoneNumber,
      representativeFamilyName,
      representativeGivenName,
      representativeFamilyNameKana,
      representativeGivenNameKana,
      postalCode,
      prefecture,
      city,
      addressLine1,
      addressLine2,
      description,
      establishedYear,
      annualFee,
      annualFeeDescription,
    } = body;

    // バリデーション
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "団体名は必須です" },
        { status: 400 }
      );
    }

    // 団体を更新
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        email: email?.trim() || null,
        phoneNumber: phoneNumber?.trim() || null,
        representativeFamilyName: representativeFamilyName?.trim() || null,
        representativeGivenName: representativeGivenName?.trim() || null,
        representativeFamilyNameKana: representativeFamilyNameKana?.trim() || null,
        representativeGivenNameKana: representativeGivenNameKana?.trim() || null,
        postalCode: postalCode?.trim() || null,
        prefecture: prefecture?.trim() || null,
        city: city?.trim() || null,
        addressLine1: addressLine1?.trim() || null,
        addressLine2: addressLine2?.trim() || null,
        description: description?.trim() || null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        annualFee: annualFee ? parseInt(annualFee) : null,
        annualFeeDescription: annualFeeDescription?.trim() || null,
      },
    });

    return NextResponse.json(organization);
  } catch (error) {
    console.error("Update organization error:", error);
    return NextResponse.json(
      { error: "団体の更新に失敗しました" },
      { status: 500 }
    );
  }
}
