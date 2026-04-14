import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const token = req.cookies.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    if (!sess?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { clubId } = await context.params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId: sess.userId,
          clubId: clubId,
        },
      },
      select: { id: true, role: true, status: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "このクラブに所属していません" },
        { status: 404 }
      );
    }

    // 承認待ちメンバーシップが残る場合は退出不可
    if (membership.status === "PENDING") {
      return NextResponse.json(
        { error: "承認待ちの所属申請はご自身で退出できません。クラブ管理者にご相談ください。" },
        { status: 409 }
      );
    }

    // 最後の管理者は退出不可
    if (membership.status === "APPROVED" && membership.role === "ADMIN") {
      const approvedAdminCount = await prisma.membership.count({
        where: {
          clubId,
          status: "APPROVED",
          role: "ADMIN",
        },
      });
      if (approvedAdminCount <= 1) {
        return NextResponse.json(
          { error: "最後の管理者は退出できません。先に他メンバーへ管理者権限を付与してください。" },
          { status: 409 }
        );
      }
    }

    // 会費未清算（UNPAID）がある場合は退出不可
    const unpaidDues = await prisma.clubDues.findFirst({
      where: {
        clubId,
        memberId: membership.id,
        status: "UNPAID",
      },
      select: { id: true },
    });
    if (unpaidDues) {
      return NextResponse.json(
        {
          error:
            "未払いの会費があるため退出できません。会費を清算後に再度お試しください。",
        },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: { id: membership.id },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: sess.userId,
          action: "MEMBERSHIP_LEAVE_SELF",
          target: `membership:${membership.id}`,
          meta: {
            clubId,
            membershipId: membership.id,
            leftAt: new Date().toISOString(),
          },
        },
      });
    });

    return NextResponse.json({ success: true, message: "クラブから退出しました" });
  } catch (error) {
    return jsonInternalError500("POST api/clubs/[clubId]/leave/route.ts", error);
  }
}
