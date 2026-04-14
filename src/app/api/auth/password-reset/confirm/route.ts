export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { hashPasswordResetToken } from "@/lib/passwordResetToken";

const BodySchema = z.object({
  token: z.string().min(20).max(512),
  password: z.string().min(8, "パスワードは8文字以上で入力してください").max(200),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(zodErrorJsonBody(parsed.error, "validation_message_ja"), { status: 400 });
    }

    const { token, password } = parsed.data;
    const tokenHash = hashPasswordResetToken(token);
    const now = new Date();

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, deletedAt: true } } },
    });

    if (!row || row.usedAt != null || row.expiresAt < now || row.user.deletedAt) {
      return NextResponse.json(
        {
          error:
            "リンクが無効か、有効期限が切れています。パスワード再設定を最初からやり直してください。",
          code: "TOKEN_INVALID",
        },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: row.userId, usedAt: null, id: { not: row.id } },
      });
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: row.userId,
        action: "PASSWORD_RESET_COMPLETE",
        target: row.userId,
        meta: { via: "email_token" },
      },
    });

    return NextResponse.json({ ok: true, message: "パスワードを更新しました。ログインしてください。" });
  } catch (error) {
    return jsonInternalError500("POST api/auth/password-reset/confirm/route.ts", error);
  }
}
