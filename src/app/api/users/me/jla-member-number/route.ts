export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import {
  isValidJlaMemberNumber,
  normalizeJlaMemberNumber,
} from "@/lib/jlaMemberNumber";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { Prisma } from "@prisma/client";

const BodySchema = z.object({
  jlaMemberNumber: z.string().min(1, "JLAメンバーIDを入力してください"),
});

export async function PUT(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const raw = await req.json().catch(() => ({}));
    const { jlaMemberNumber: rawInput } = BodySchema.parse(raw);
    const normalized = normalizeJlaMemberNumber(rawInput);

    if (!isValidJlaMemberNumber(normalized)) {
      return NextResponse.json(
        { error: "JLAメンバーIDは500から始まる9桁の半角数字で入力してください" },
        { status: 400 }
      );
    }

    const conflict = await prisma.userJlaProfile.findFirst({
      where: {
        jlaMemberNumber: normalized,
        NOT: { userId: sess.userId },
      },
      select: { userId: true },
    });

    if (conflict) {
      return NextResponse.json(
        { error: "このJLAメンバーIDは既に別の会員に登録されています" },
        { status: 400 }
      );
    }

    const previous = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { jlaProfile: { select: { jlaMemberNumber: true } } },
    });

    if (!previous) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    if (previous.jlaProfile?.jlaMemberNumber === normalized) {
      return NextResponse.json({
        message: "登録済みのJLAメンバーIDです",
        jlaMemberNumber: normalized,
      });
    }

    const updated = await prisma.user.update({
      where: { id: sess.userId },
      data: {
        jlaProfile: {
          upsert: {
            create: { jlaMemberNumber: normalized },
            update: { jlaMemberNumber: normalized },
          },
        },
      },
      select: { jlaProfile: { select: { jlaMemberNumber: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: "JLA_MEMBER_NUMBER_SET",
        target: `user:${sess.userId}`,
        meta: {
          previous: previous.jlaProfile?.jlaMemberNumber ?? null,
          next: normalized,
        },
      },
    });

    return NextResponse.json({
      message: "JLAメンバーIDを保存しました",
      jlaMemberNumber: updated.jlaProfile?.jlaMemberNumber ?? normalized,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "このJLAメンバーIDは既に使用されています" },
        { status: 400 }
      );
    }
    return jsonInternalError500("PUT api/users/me/jla-member-number/route.ts", err);
  }
}
