// GET /api/admin/users/security-lookup?q=  PF 管理者のみ。ログイン環境・パスキー・監査参照用。
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isPfAdminRole } from "@/lib/governancePolicy";
import { maskPhoneNumber } from "@/lib/phone";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });
  if (!isPfAdminRole(me?.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json(
      { error: "検索語は3文字以上で入力してください" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ id: q }, { email: q }],
    },
    select: {
      id: true,
      familyName: true,
      givenName: true,
      email: true,
      phoneNumber: true,
      lastLoginAt: true,
      lastLoginIp: true,
      lastLoginUa: true,
      _count: { select: { passkeyCredentials: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  const loginAudits = await prisma.auditLog.findMany({
    where: {
      actorUserId: user.id,
      action: "USER_LOGIN_SUCCESS",
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      createdAt: true,
      meta: true,
    },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      familyName: user.familyName,
      givenName: user.givenName,
      email: user.email,
      phoneMasked: maskPhoneNumber(user.phoneNumber),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      lastLoginIp: user.lastLoginIp,
      lastLoginUa: user.lastLoginUa,
      passkeyCount: user._count.passkeyCredentials,
    },
    loginAudits: loginAudits.map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      meta: a.meta,
    })),
  });
}
