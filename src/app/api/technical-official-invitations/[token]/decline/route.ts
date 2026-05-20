export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const jar = await cookies();
    const sessionToken = jar.get("session")?.value;
    const session = sessionToken ? await verifySession(sessionToken) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const inv = await prisma.competitionTechnicalOfficialInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        status: true,
        invitedUserId: true,
        invitePhoneE164: true,
      },
    });

    if (!inv) {
      return NextResponse.json({ error: "招待が見つかりません" }, { status: 404 });
    }
    if (inv.status !== "PENDING") {
      return NextResponse.json({ error: "この招待はすでに処理されています" }, { status: 400 });
    }

    if (inv.invitedUserId) {
      if (inv.invitedUserId !== session.userId) {
        return NextResponse.json({ error: "この招待の宛先ではありません" }, { status: 403 });
      }
    } else if (inv.invitePhoneE164) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { contact: { select: { phoneNumber: true } } },
      });
      if (!user || user.contact?.phoneNumber !== inv.invitePhoneE164) {
        return NextResponse.json(
          { error: "招待された電話番号でログインしている必要があります" },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: "招待データが不正です" }, { status: 400 });
    }

    await prisma.competitionTechnicalOfficialInvitation.update({
      where: { id: inv.id },
      data: { status: "DECLINED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500(
      "POST api/technical-official-invitations/[token]/decline",
      error
    );
  }
}
