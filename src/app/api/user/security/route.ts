// POST /api/user/security
// メール+パスワード設定
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import bcrypt from "bcrypt";
import { sendSecurityNoticeSms } from "@/lib/sns";
import { phoneToE164Loose } from "@/lib/phone";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { safeServerErrorLog } from "@/lib/safeServerLog";

const SecuritySetupSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 認証チェック
    const jar = await cookies();
    const token = jar.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const sess = await verifySession(token);
    if (!sess?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data = SecuritySetupSchema.parse(body);

    if (!data.email && !data.password) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードを指定してください" },
        { status: 400 }
      );
    }

    // 現在のユーザー情報取得
    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: {
        email: true,
        security: { select: { passwordHash: true } },
        contact: { select: { phoneNumber: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const userUpdate: Prisma.UserUpdateInput = {};
    const securityUpdate: Prisma.UserSecurityUpdateInput = {};

    if (data.email) {
      // メールアドレス重複チェック
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser && existingUser.id !== sess.userId) {
        return NextResponse.json(
          { error: "このメールアドレスは既に使用されています" },
          { status: 400 }
        );
      }

      userUpdate.email = data.email;
      securityUpdate.emailVerified = false; // メールアドレス変更時は再確認必要
    }

    if (data.password) {
      if (user.security?.passwordHash) {
        return NextResponse.json(
          { error: "パスワードは既に設定されています。変更する場合は別の機能を使用してください。" },
          { status: 400 }
        );
      }

      securityUpdate.passwordHash = await bcrypt.hash(data.password, 10);
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id: sess.userId },
          data: userUpdate,
        });
      }
      if (Object.keys(securityUpdate).length > 0) {
        const securityCreate: Prisma.UserSecurityUncheckedCreateInput = {
          userId: sess.userId,
        };
        if (securityUpdate.emailVerified !== undefined) {
          securityCreate.emailVerified = securityUpdate.emailVerified as boolean;
        }
        if (securityUpdate.passwordHash !== undefined) {
          securityCreate.passwordHash = securityUpdate.passwordHash as string;
        }
        await tx.userSecurity.upsert({
          where: { userId: sess.userId },
          create: securityCreate,
          update: securityUpdate,
        });
      }
    });

    const smsTo = user.contact?.phoneNumber ? phoneToE164Loose(user.contact.phoneNumber) : null;
    if (smsTo) {
      try {
        if (data.password) {
          await sendSecurityNoticeSms(
            smsTo,
            "Bluvium: アカウントにパスワードが設定されました。心当たりがない場合は至急ご確認ください。"
          );
        }
        if (data.email) {
          await sendSecurityNoticeSms(
            smsTo,
            "Bluvium: メールアドレスの変更手続きを行いました。心当たりがない場合は至急ご確認ください。"
          );
        }
      } catch (e) {
        safeServerErrorLog("Security notice SMS failed", e);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "セキュリティ設定を更新しました",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500("POST api/user/security/route.ts", error);
  }
}
