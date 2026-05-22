import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { normalizeOrgRoleForWrite } from "@/lib/roleScopes";
import { parseOptionalWebsiteUrlField } from "@/lib/safeExternalUrl";
import {
  isValidPhoneE164,
  normalizeOptionalPhoneE164,
} from "@/lib/phone";

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
        profile: {
          select: {
            familyName: true,
            givenName: true,
            familyNameKana: true,
            givenNameKana: true,
          },
        },
      },
    });

    if (!user?.profile) {
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

    const websiteUrlParsed = parseOptionalWebsiteUrlField(websiteUrl);
    if (!websiteUrlParsed.ok) {
      return NextResponse.json(
        { error: websiteUrlParsed.error },
        { status: 400 }
      );
    }

    const phoneNumberE164 = normalizeOptionalPhoneE164(phoneNumber);
    if (phoneNumber?.trim() && (!phoneNumberE164 || !isValidPhoneE164(phoneNumberE164))) {
      return NextResponse.json(
        { error: "電話番号の形式が正しくありません" },
        { status: 400 }
      );
    }

    // 団体を作成（代表者情報は作成者の情報を使用）
    const organization = await prisma.organization.create({
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrlParsed.value,
        email: email?.trim() || null,
        phoneNumber: phoneNumberE164,
        representativeFamilyName: user.profile.familyName,
        representativeGivenName: user.profile.givenName,
        representativeFamilyNameKana: user.profile.familyNameKana,
        representativeGivenNameKana: user.profile.givenNameKana,
        representativeUserId: session.userId,
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

    // 作成者を自動的に管理者として追加
    await prisma.orgAdmin.create({
      data: {
        userId: session.userId,
        organizationId: organization.id,
        role: normalizeOrgRoleForWrite("ADMIN"),
      },
    });

    return NextResponse.json(organization);
  } catch (error) {
    return jsonInternalError500("POST api/organizations/create/route.ts", error);
  }
}
