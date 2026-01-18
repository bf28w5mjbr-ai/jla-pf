// POST /api/user/security
// メール+パスワード設定
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import bcrypt from "bcrypt";

const SecuritySetupSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    console.log("=== /api/user/security POST ===");
    
    // 認証チェック
    const jar = await cookies();
    const token = jar.get('session')?.value;
    if (!token) {
      console.log("❌ No token");
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const sess = await verifySession(token);
    if (!sess?.userId) {
      console.log("❌ No session userId");
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    console.log("✅ User ID:", sess.userId);

    const body = await req.json().catch(() => ({}));
    console.log("📦 Request body:", body);
    
    const data = SecuritySetupSchema.parse(body);
    console.log("✅ Validated data:", data);

    if (!data.email && !data.password) {
      console.log("❌ No email or password provided");
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードを指定してください" },
        { status: 400 }
      );
    }

    // 現在のユーザー情報取得
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { email: true, passwordHash: true },
    });
    console.log("👤 Current user:", { email: user?.email, hasPassword: !!user?.passwordHash });

    if (!user) {
      console.log("❌ User not found");
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    // 更新データ準備
    const updateData: any = {};

    if (data.email) {
      console.log("📧 Checking email:", data.email);
      // メールアドレス重複チェック
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser && existingUser.id !== sess.userId) {
        console.log("❌ Email already in use");
        return NextResponse.json(
          { error: "このメールアドレスは既に使用されています" },
          { status: 400 }
        );
      }

      updateData.email = data.email;
      updateData.emailVerified = false; // メールアドレス変更時は再確認必要
      console.log("✅ Email will be updated");
    }

    if (data.password) {
      console.log("🔐 Password provided, checking if already set");
      if (user.passwordHash) {
        console.log("❌ Password already set");
        return NextResponse.json(
          { error: "パスワードは既に設定されています。変更する場合は別の機能を使用してください。" },
          { status: 400 }
        );
      }

      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      console.log("✅ Password hashed");
    }

    // 更新実行
    console.log("💾 Update data:", updateData);
    await prisma.user.update({
      where: { id: sess.userId },
      data: updateData,
    });
    console.log("✅ User updated successfully");

    return NextResponse.json({
      ok: true,
      message: "セキュリティ設定を更新しました",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Zod validation error:", error.errors);
      return NextResponse.json(
        { error: "入力内容に誤りがあります", details: error.errors },
        { status: 400 }
      );
    }

    console.error("❌ Security setup error:", error);
    return NextResponse.json(
      { error: "設定に失敗しました" },
      { status: 500 }
    );
  }
}
