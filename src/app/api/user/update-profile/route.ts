import { jsonInternalError500 } from "@/lib/apiInternalError";
import { normalizeKana } from "@/lib/normalize-kana";
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

    const normalizedFamilyName = normalizeKana(familyNameKana);
    const normalizedGivenName = normalizeKana(givenNameKana);

    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: {
        profile: {
          upsert: {
            create: {
              familyName,
              givenName,
              familyNameKana,
              givenNameKana,
              normalizedFamilyName,
              normalizedGivenName,
              dateOfBirth: new Date(dateOfBirth),
              sex,
            },
            update: {
              familyName,
              givenName,
              familyNameKana,
              givenNameKana,
              normalizedFamilyName,
              normalizedGivenName,
              dateOfBirth: new Date(dateOfBirth),
              sex,
            },
          },
        },
        address: {
          upsert: {
            create: {
              postalCode,
              prefecture,
              city,
              addressLine1,
              addressLine2: addressLine2 || null,
            },
            update: {
              postalCode,
              prefecture,
              city,
              addressLine1,
              addressLine2: addressLine2 || null,
            },
          },
        },
        emergencyContact: {
          upsert: {
            create: {
              familyName: emergencyContactFamilyName || null,
              givenName: emergencyContactGivenName || null,
              phoneNumber: emergencyContactPhone || null,
            },
            update: {
              familyName: emergencyContactFamilyName || null,
              givenName: emergencyContactGivenName || null,
              phoneNumber: emergencyContactPhone || null,
            },
          },
        },
      },
      select: {
        id: true,
        profile: {
          select: {
            familyName: true,
            givenName: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "プロフィールを更新しました",
      user: updatedUser,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/user/update-profile/route.ts", error);
  }
}
