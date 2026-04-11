export const runtime = "nodejs";

import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import {
  DAY_OPS_UNLOCK_MAX_AGE_SEC,
  dayOpsUnlockCookieName,
  signDayOpsUnlockJwt,
} from "@/lib/dayOpsUnlockCookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (code.length < 4) {
      return NextResponse.json({ error: "暗号を4文字以上で入力してください" }, { status: 400 });
    }

    const row = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { dayOpsAccessSecretHash: true, status: true },
    });
    if (!row) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (row.status === "DRAFT") {
      return NextResponse.json({ error: "公開前の大会です" }, { status: 403 });
    }
    if (!row.dayOpsAccessSecretHash) {
      return NextResponse.json(
        { error: "当日運用暗号が未設定です。主催が大会管理から設定してください。" },
        { status: 400 }
      );
    }

    const ok = await bcrypt.compare(code, row.dayOpsAccessSecretHash);
    if (!ok) {
      return NextResponse.json({ error: "暗号が正しくありません" }, { status: 401 });
    }

    const jwt = await signDayOpsUnlockJwt(competitionId);
    const res = NextResponse.json({ success: true });
    res.cookies.set(dayOpsUnlockCookieName(competitionId), jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DAY_OPS_UNLOCK_MAX_AGE_SEC,
    });
    return res;
  } catch (err) {
    return jsonInternalError500("POST api/competitions/[id]/day-ops-unlock/route.ts", err);
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const res = NextResponse.json({ success: true });
    res.cookies.set(dayOpsUnlockCookieName(competitionId), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return jsonInternalError500("DELETE api/competitions/[id]/day-ops-unlock/route.ts", err);
  }
}
