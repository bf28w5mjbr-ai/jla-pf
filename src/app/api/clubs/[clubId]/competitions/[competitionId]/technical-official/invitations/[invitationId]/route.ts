export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ clubId: string; competitionId: string; invitationId: string }>;
  }
) {
  try {
    const { clubId, competitionId, invitationId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireClubAdmin(clubId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const inv = await prisma.competitionTechnicalOfficialInvitation.findFirst({
      where: { id: invitationId, competitionId, clubId },
      select: { id: true, status: true },
    });
    if (!inv) {
      return NextResponse.json({ error: "招待が見つかりません" }, { status: 404 });
    }
    if (inv.status !== "PENDING") {
      return NextResponse.json({ error: "すでに処理済みの招待です" }, { status: 400 });
    }

    await prisma.competitionTechnicalOfficialInvitation.update({
      where: { id: invitationId },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500(
      "DELETE api/clubs/.../technical-official/invitations/[invitationId]",
      error
    );
  }
}
