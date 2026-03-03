import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      familyName,
      givenName,
      familyNameKana,
      givenNameKana,
      dateOfBirth,
      sex,
      postalCode,
      prefecture,
      city,
      addressLine1,
      addressLine2,
      emergencyContactFamilyName,
      emergencyContactGivenName,
      emergencyContactPhone,
    } = body;

    // カタカナ正規化（検索用）
    const normalizedFamilyName = familyNameKana.replace(/[ァ-ヴ]/g, (c: string) => 
      String.fromCharCode(c.charCodeAt(0) - 0x60)
    );
    const normalizedGivenName = givenNameKana.replace(/[ァ-ヴ]/g, (c: string) => 
      String.fromCharCode(c.charCodeAt(0) - 0x60)
    );

    // ユーザー情報を更新
    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: {
        familyName,
        givenName,
        familyNameKana,
        givenNameKana,
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth: new Date(dateOfBirth),
        sex,
        postalCode,
        prefecture,
        city,
        addressLine1,
        addressLine2: addressLine2 || null,
        emergencyContactFamilyName: emergencyContactFamilyName || null,
        emergencyContactGivenName: emergencyContactGivenName || null,
        emergencyContactPhone: emergencyContactPhone || null,
      },
      select: {
        id: true,
        familyName: true,
        givenName: true,
      },
    });

    return NextResponse.json({
      message: "プロフィールを更新しました",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "プロフィールの更新に失敗しました" },
      { status: 500 }
    );
  }
}
