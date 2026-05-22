import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";
import { normalizeClubRoleForWrite } from "@/lib/roleScopes";
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
        address: true,
        contact: { select: { phoneNumber: true } },
      },
    });

    if (!user?.profile || !user.address || !user.contact) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      nameKana,
      abbreviation,
      websiteUrl,
      isLifesavingClub,
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

    const websiteUrlParsed = parseOptionalWebsiteUrlField(websiteUrl);
    if (!websiteUrlParsed.ok) {
      return NextResponse.json(
        { error: websiteUrlParsed.error },
        { status: 400 }
      );
    }

    const lifesaving = Boolean(isLifesavingClub);

    const officePhoneE164 = normalizeOptionalPhoneE164(officePhone);
    if (officePhone?.trim() && (!officePhoneE164 || !isValidPhoneE164(officePhoneE164))) {
      return NextResponse.json(
        { error: "事務局電話番号の形式が正しくありません" },
        { status: 400 }
      );
    }

    // クラブを作成（代表者情報は作成者の情報を使用）
    const club = await prisma.club.create({
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrlParsed.value,
        isLifesavingClub: lifesaving,
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
        representativeUserId: session.userId,
        patrolLocation: lifesaving ? patrolLocation?.trim() || null : null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        officePostalCode: officePostalCode?.trim() || null,
        officePrefecture: officePrefecture?.trim() || null,
        officeCity: officeCity?.trim() || null,
        officeAddressLine1: officeAddressLine1?.trim() || null,
        officeAddressLine2: officeAddressLine2?.trim() || null,
        officePhone: officePhoneE164,
        mailingName: mailingName?.trim() || null,
        status: "APPROVED",
        type: null,
        creatorId: session.userId,
      },
    });

    // 作成者を自動的に管理者として登録
    await prisma.membership.create({
      data: {
        userId: session.userId,
        clubId: club.id,
        role: normalizeClubRoleForWrite("ADMIN"),
        status: "APPROVED",
      },
    });

    return NextResponse.json({
      message: "クラブを作成しました。メンバーの参加申請は管理者が承認してください。",
      club: {
        id: club.id,
        name: club.name,
        status: club.status,
      },
    });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/create/route.ts", error);
  }
}
