import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export type RegistrationConflictBody = {
  error: string;
  existingUser?: boolean;
};

/**
 * 登録 verify 時の P2002 をユーザー向け 409 に変換する。
 */
export function registrationUniqueConstraintResponse(
  error: Prisma.PrismaClientKnownRequestError
): NextResponse<RegistrationConflictBody> | null {
  if (error.code !== "P2002") return null;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [];
  const targetBlob = fields.join(" ").toLowerCase();

  if (fields.includes("email") || targetBlob.includes("email")) {
    return NextResponse.json(
      {
        error: "このメールアドレスは既に登録されています。最初からやり直してください。",
        existingUser: true,
      },
      { status: 409 }
    );
  }

  if (
    fields.includes("normalizedFamilyName") ||
    fields.includes("normalizedGivenName") ||
    fields.includes("dateOfBirth") ||
    targetBlob.includes("normalizedfamilyname") ||
    targetBlob.includes("normalizedgivenname") ||
    targetBlob.includes("dateofbirth") ||
    targetBlob.includes("userprofile")
  ) {
    return NextResponse.json(
      {
        error: "同じ氏名・生年月日のアカウントが既に存在します。最初からやり直してください。",
        existingUser: true,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: "登録情報が既に使用されています。最初からやり直してください。" },
    { status: 409 }
  );
}
