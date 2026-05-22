import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { parseOptionalWebsiteUrlField } from "@/lib/safeExternalUrl";
import {
  isValidPhoneE164,
  normalizeOptionalPhoneE164,
} from "@/lib/phone";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
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
    const organizationId = params.orgId;

    // 管理者権限チェック
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
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

    // 団体を更新
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrlParsed.value,
        email: email?.trim() || null,
        phoneNumber: phoneNumberE164,
        postalCode: postalCode?.trim() || null,
        prefecture: prefecture?.trim() || null,
        city: city?.trim() || null,
        addressLine1: addressLine1?.trim() || null,
        addressLine2: addressLine2?.trim() || null,
        description: description?.trim() || null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
      },
    });

    return NextResponse.json(organization);
  } catch (error) {
    return jsonInternalError500("PUT api/organizations/[orgId]/update/route.ts", error);
  }
}
