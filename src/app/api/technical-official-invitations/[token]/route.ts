export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    if (!token) {
      return NextResponse.json({ error: "不正なリンクです" }, { status: 400 });
    }

    const inv = await prisma.competitionTechnicalOfficialInvitation.findUnique({
      where: { token },
      include: {
        competition: { select: { id: true, name: true } },
        club: { select: { id: true, name: true } },
      },
    });

    if (!inv) {
      return NextResponse.json({ error: "招待が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      invitation: {
        status: inv.status,
        competition: inv.competition,
        club: inv.club,
        invitePhoneE164: inv.invitePhoneE164,
      },
    });
  } catch (error) {
    return jsonInternalError500("GET api/technical-official-invitations/[token]", error);
  }
}
