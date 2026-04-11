import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getOrgAdminContextForCompetition } from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { zodFlattenJsonBody } from "@/lib/zodApiResponse";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const payloadSchema = z.object({
  userId: z.string().min(1),
  nfcTagId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(200),
});

function normalizeTag(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-:]/g, "");
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const access = await getOrgAdminContextForCompetition(competitionId, session.userId);
    if (!access.isOrgAdmin) {
      return NextResponse.json({ error: "主催管理者のみ操作できます" }, { status: 403 });
    }

    const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(zodFlattenJsonBody(parsed.error), { status: 400 });
    }
    const { userId, reason } = parsed.data;
    const nfcTagId = normalizeTag(parsed.data.nfcTagId);

    const [targetUser, entryCount, teamMemberCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, familyName: true, givenName: true, nfcTagId: true },
      }),
      prisma.competitionEntry.count({
        where: {
          competitionId,
          userId,
          status: "SUBMITTED",
        },
      }),
      prisma.teamEntryMember.count({
        where: {
          userId,
          teamEntry: { competitionId },
        },
      }),
    ]);

    if (!targetUser) {
      return NextResponse.json({ error: "対象ユーザーが見つかりません" }, { status: 404 });
    }
    if (entryCount === 0 && teamMemberCount === 0) {
      return NextResponse.json(
        { error: "この大会の出場者のみ代理紐付けできます" },
        { status: 400 }
      );
    }

    const conflictUser = await prisma.user.findFirst({
      where: {
        nfcTagId,
        id: { not: userId },
        deletedAt: null,
      },
      select: { id: true, familyName: true, givenName: true },
    });

    await prisma.$transaction(async (tx) => {
      if (conflictUser) {
        await tx.user.update({
          where: { id: conflictUser.id },
          data: { nfcTagId: null },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { nfcTagId },
      });
    });

    await logAuditAction({
      action: "COMPETITION_NFC_TAG_REBIND",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "User",
      targetId: userId,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        targetUserId: userId,
        nfcTagId,
        reason,
        replacedUserId: conflictUser?.id ?? null,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({
      ok: true,
      userId,
      userName: `${targetUser.familyName} ${targetUser.givenName}`,
      replacedUserId: conflictUser?.id ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/nfc-tags/route.ts",
      error
    );
  }
}
