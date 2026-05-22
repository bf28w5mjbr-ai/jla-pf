import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireClubAdmin } from "@/lib/accessControl";
import { parseOptionalWebsiteUrlField } from "@/lib/safeExternalUrl";
import {
  isValidPhoneE164,
  normalizeOptionalPhoneE164,
} from "@/lib/phone";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    // セッション確認
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 管理者かチェック
    try {
      await requireClubAdmin(clubId, sess.userId);
    } catch {
      return NextResponse.json(
        { error: "クラブの管理者のみが編集できます" },
        { status: 403 }
      );
    }

    const body = await req.json();
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

    // クラブ情報を更新
    const club = await prisma.club.update({
      where: { id: clubId },
      data: {
        name: name.trim(),
        nameKana: nameKana?.trim() || null,
        abbreviation: abbreviation?.trim() || null,
        websiteUrl: websiteUrlParsed.value,
        isLifesavingClub: lifesaving,
        patrolLocation: lifesaving ? patrolLocation?.trim() || null : null,
        establishedYear: establishedYear ? parseInt(establishedYear) : null,
        officePostalCode: officePostalCode?.trim() || null,
        officePrefecture: officePrefecture?.trim() || null,
        officeCity: officeCity?.trim() || null,
        officeAddressLine1: officeAddressLine1?.trim() || null,
        officeAddressLine2: officeAddressLine2?.trim() || null,
        officePhone: officePhoneE164,
        mailingName: mailingName?.trim() || null,
      },
    });

    return NextResponse.json({
      message: "クラブ情報を更新しました",
      club,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/clubs/[clubId]/update/route.ts", error);
  }
}
