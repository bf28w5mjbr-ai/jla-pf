export const runtime = "nodejs";

import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

type RouteContext = {
  params: Promise<{ orgId: string; competitionId: string }>;
};

const MIN_PASSPHRASE_LEN = 6;

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { orgId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }
    try {
      await requireOrgAdmin(orgId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { passphrase?: string | null };
    const raw =
      body.passphrase === null || body.passphrase === undefined
        ? null
        : typeof body.passphrase === "string"
          ? body.passphrase
          : undefined;
    if (raw === undefined) {
      return NextResponse.json({ error: "passphrase フィールドが必要です" }, { status: 400 });
    }

    if (raw === null || raw.trim() === "") {
      await prisma.competition.updateMany({
        where: { id: competitionId, organizationId: orgId },
        data: { dayOpsAccessSecretHash: null },
      });
      return NextResponse.json({ success: true, configured: false });
    }

    const passphrase = raw.trim();
    if (passphrase.length < MIN_PASSPHRASE_LEN) {
      return NextResponse.json(
        { error: `暗号は${MIN_PASSPHRASE_LEN}文字以上にしてください` },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(passphrase, 10);
    const updated = await prisma.competition.updateMany({
      where: { id: competitionId, organizationId: orgId },
      data: { dayOpsAccessSecretHash: hash },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true, configured: true });
  } catch (err) {
    return jsonInternalError500(
      "PUT api/organizations/[orgId]/competitions/[competitionId]/day-ops-access/route.ts",
      err
    );
  }
}
