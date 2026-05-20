export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { syncUserHeldQualifications } from "@/lib/qualificationSelfServiceSync";
import { normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const PutBodySchema = z.object({
  templateIds: z.array(z.string()).max(200).optional().default([]),
  // 後方互換: 旧クライアントは資格テンプレートの kind を送っていた。
  kinds: z.array(z.string()).max(200).optional().default([]),
  jlaMemberNumber: z
    .string()
    .optional()
    .transform((value) => {
      if (typeof value !== "string") return undefined;
      const normalized = normalizeJlaMemberNumber(value);
      return normalized === "" ? undefined : normalized;
    }),
  // 後方互換: 旧クライアントはJLAメンバーIDをcertNumberとして送っていた。
  certNumber: z.string().optional(),
});

/** PUT — 申請資格（ユーザー選択）をチェック内容どおりに同期（審査なし・即時 APPROVED） */
export async function PUT(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data = PutBodySchema.parse(body);

    const result = await syncUserHeldQualifications(
      sess.userId,
      data.kinds,
      data.jlaMemberNumber ?? data.certNumber,
      data.templateIds
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
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
    return jsonInternalError500("PUT api/users/me/qualifications/route.ts", err);
  }
}
