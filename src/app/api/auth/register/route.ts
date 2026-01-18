// src/app/api/auth/register/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import bcrypt from "bcrypt";
import { z } from "zod";
import { normalizeKana, normalizePhone } from "@/lib/normalize-kana";

const RegisterSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上である必要があります"),
  familyName: z.string().min(1, "姓を入力してください"),
  givenName: z.string().min(1, "名を入力してください"),
  familyNameKana: z.string().min(1, "姓（カナ）を入力してください"),
  givenNameKana: z.string().min(1, "名（カナ）を入力してください"),
  dateOfBirth: z.string().min(1, "生年月日を入力してください"),
  phoneNumber: z.string().optional(),
  jlaMemberNumber: z.string().optional(),
  emergencyContactFamilyName: z.string().optional(),
  emergencyContactGivenName: z.string().optional(),
  emergencyContactFamilyNameKana: z.string().optional(),
  emergencyContactGivenNameKana: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = RegisterSchema.parse(body);

    // 正規化処理
    const normalizedFamilyName = normalizeKana(data.familyNameKana);
    const normalizedGivenName = normalizeKana(data.givenNameKana);
    const normalizedPhone = data.phoneNumber ? normalizePhone(data.phoneNumber) : null;
    const dateOfBirth = new Date(data.dateOfBirth);

    // 1. メールアドレスの重複チェック
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 400 }
      );
    }

    // 2. 電話番号の重複チェック
    if (normalizedPhone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phoneNumber: normalizedPhone },
      });
      if (existingPhone) {
        return NextResponse.json(
          { error: "この電話番号は既に登録されています" },
          { status: 400 }
        );
      }
    }

    // 3. 氏名+生年月日の重複チェック
    const existingPerson = await prisma.user.findFirst({
      where: {
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth,
      },
    });
    if (existingPerson) {
      return NextResponse.json(
        { 
          error: "同じ氏名・生年月日のアカウントが既に存在します。既にアカウントをお持ちの場合はログインしてください。",
          existingUser: true
        },
        { status: 400 }
      );
    }

    // 4. JLA会員番号の重複チェック（入力された場合）
    if (data.jlaMemberNumber) {
      const existingMember = await prisma.user.findUnique({
        where: { jlaMemberNumber: data.jlaMemberNumber },
      });
      if (existingMember) {
        return NextResponse.json(
          { error: "このJLA会員番号は既に登録されています" },
          { status: 400 }
        );
      }
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(data.password, 10);

    // ユーザー作成
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        familyName: data.familyName,
        givenName: data.givenName,
        familyNameKana: data.familyNameKana,
        givenNameKana: data.givenNameKana,
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth,
        phoneNumber: normalizedPhone,
        jlaMemberNumber: data.jlaMemberNumber || null,
        emergencyContactFamilyName: data.emergencyContactFamilyName || null,
        emergencyContactGivenName: data.emergencyContactGivenName || null,
        emergencyContactFamilyNameKana: data.emergencyContactFamilyNameKana || null,
        emergencyContactGivenNameKana: data.emergencyContactGivenNameKana || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emailVerified: true, // 簡易実装のため即座に検証済みとする
      },
      select: {
        id: true,
        email: true,
        familyName: true,
        givenName: true,
        role: true,
      },
    });

    return NextResponse.json({
      message: "登録が完了しました。ログインしてください。",
      user,
    }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "入力内容を確認してください", details: err.errors },
        { status: 400 }
      );
    }

    console.error("Register error:", err);
    return NextResponse.json(
      { error: "登録に失敗しました" },
      { status: 500 }
    );
  }
}
