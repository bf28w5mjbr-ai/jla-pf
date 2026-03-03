// src/app/api/auth/register/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import bcrypt from "bcrypt";
import { z } from "zod";
import { normalizeKana, normalizePhone } from "@/lib/normalize-kana";
import { isValidJapaneseMobile, toE164 } from "@/lib/phone";

const RegisterSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上である必要があります"),
  familyName: z.string().min(1, "姓を入力してください"),
  givenName: z.string().min(1, "名を入力してください"),
  familyNameKana: z.string().min(1, "姓（カナ）を入力してください"),
  givenNameKana: z.string().min(1, "名（カナ）を入力してください"),
  dateOfBirth: z.string().min(1, "生年月日を入力してください"),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]),
  postalCode: z.string().min(1, "郵便番号を入力してください"),
  prefecture: z.string().min(1, "都道府県を入力してください"),
  city: z.string().min(1, "市区町村を入力してください"),
  addressLine1: z.string().min(1, "住所を入力してください"),
  addressLine2: z.string().optional(),
  phoneNumber: z.string().min(10, "電話番号を入力してください"),
  jlaMemberNumber: z.string().regex(/^5000\d{5}$/, "JLA会員番号は5000から始まる9桁で入力してください").optional(),
  emergencyContactFamilyName: z.string().min(1, "緊急連絡先の姓を入力してください"),
  emergencyContactGivenName: z.string().min(1, "緊急連絡先の名を入力してください"),
  emergencyContactFamilyNameKana: z.string().min(1, "緊急連絡先の姓（カナ）を入力してください"),
  emergencyContactGivenNameKana: z.string().min(1, "緊急連絡先の名（カナ）を入力してください"),
  emergencyContactPhone: z.string().min(10, "緊急連絡先の電話番号を入力してください"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = RegisterSchema.parse(body);

    // 正規化処理
    const normalizedFamilyName = normalizeKana(data.familyNameKana);
    const normalizedGivenName = normalizeKana(data.givenNameKana);
    if (!isValidJapaneseMobile(data.phoneNumber)) {
      return NextResponse.json(
        { error: "有効な日本国内の携帯電話番号を入力してください" },
        { status: 400 }
      );
    }

    const normalizedPhone = toE164(data.phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "電話番号が不正です" },
        { status: 400 }
      );
    }
    const normalizedLocalPhone = normalizePhone(data.phoneNumber);
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
    const existingPhone = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: normalizedPhone },
          { phoneNumber: normalizedLocalPhone },
        ],
      },
    });
    if (existingPhone) {
      return NextResponse.json(
        { error: "この電話番号は既に登録されています" },
        { status: 400 }
      );
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
        sex: data.sex,
        postalCode: data.postalCode,
        prefecture: data.prefecture,
        city: data.city,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        phoneNumber: normalizedPhone,
        jlaMemberNumber: data.jlaMemberNumber || null,
        emergencyContactFamilyName: data.emergencyContactFamilyName,
        emergencyContactGivenName: data.emergencyContactGivenName,
        emergencyContactFamilyNameKana: data.emergencyContactFamilyNameKana,
        emergencyContactGivenNameKana: data.emergencyContactGivenNameKana,
        emergencyContactPhone: data.emergencyContactPhone,
        emailVerified: false,
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
      message: "パスキー登録へ進んでください。",
      userId: user.id,
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
