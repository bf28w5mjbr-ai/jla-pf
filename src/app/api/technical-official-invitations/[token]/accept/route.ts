export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { PrismaClient } from "@prisma/client";
import {
  countValidTechnicalOfficialAssignments,
  getTechnicalOfficialStatusForClub,
} from "@/lib/technicalOfficialQueries";
import { hasRequiredOfficialQualifications } from "@/lib/technicalOfficialRules";

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

    const userId = session.userId;

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.competitionTechnicalOfficialInvitation.findUnique({
        where: { token },
        include: {
          competition: {
            select: {
              id: true,
              officialRecruitmentEnabled: true,
              technicalOfficialRecruitmentEnabled: true,
              officialQualificationFilterEnabled: true,
            },
          },
        },
      });

      if (!inv) {
        return { error: "招待が見つかりません" as const, status: 404 as const };
      }
      if (inv.status !== "PENDING") {
        return { error: "この招待はすでに処理されています" as const, status: 400 as const };
      }
      if (!inv.competition.officialRecruitmentEnabled || !inv.competition.technicalOfficialRecruitmentEnabled) {
        return { error: "この大会ではTO機能が無効になっています" as const, status: 400 as const };
      }

      if (inv.invitedUserId) {
        if (inv.invitedUserId !== userId) {
          return { error: "この招待の宛先ではありません" as const, status: 403 as const };
        }
      } else if (inv.invitePhoneE164) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { phoneNumber: true },
        });
        if (!user || user.phoneNumber !== inv.invitePhoneE164) {
          return {
            error: "招待された電話番号でログインしている必要があります",
            status: 403 as const,
          };
        }
      } else {
        return { error: "招待データが不正です" as const, status: 400 as const };
      }

      const membership = await tx.membership.findFirst({
        where: {
          clubId: inv.clubId,
          userId,
          status: "APPROVED",
        },
        select: { id: true },
      });
      if (!membership) {
        return {
          error: "このクラブの承認済みメンバーである必要があります",
          status: 403 as const,
        };
      }

      const quals = await tx.qualification.findMany({
        where: { userId },
        select: { kind: true, status: true, expiryDate: true },
      });
      const requireQualificationFilter = Boolean(inv.competition.officialQualificationFilterEnabled);
      const hasQual = requireQualificationFilter
        ? hasRequiredOfficialQualifications(
            quals.map((q) => ({
              kind: q.kind,
              status: q.status,
              expiryDate: q.expiryDate,
            }))
          )
        : true;
      if (!hasQual && requireQualificationFilter) {
        return {
          error:
            "テクニカルオフィシャル応募には、オフィシャル資格要件設定で定義された資格の承認が必要です",
          status: 400 as const,
        };
      }

      const txClient = tx as unknown as PrismaClient;
      const status = await getTechnicalOfficialStatusForClub(
        txClient,
        inv.competitionId,
        inv.clubId
      );
      if (!status || status.required <= 0) {
        return { error: "現在は任命が不要です" as const, status: 400 as const };
      }

      const assigned = await countValidTechnicalOfficialAssignments(
        txClient,
        inv.competitionId,
        inv.clubId,
        requireQualificationFilter
      );
      if (assigned >= status.required) {
        return { error: "すでに必要人数が満たされています" as const, status: 400 as const };
      }

      const existing = await tx.competitionTechnicalOfficialAssignment.findUnique({
        where: {
          competitionId_clubId_userId: {
            competitionId: inv.competitionId,
            clubId: inv.clubId,
            userId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        await tx.competitionTechnicalOfficialInvitation.update({
          where: { id: inv.id },
          data: { status: "ACCEPTED" },
        });
        return { success: true as const, already: true as const };
      }

      await tx.competitionTechnicalOfficialAssignment.create({
        data: {
          competitionId: inv.competitionId,
          clubId: inv.clubId,
          userId,
          invitationId: inv.id,
        },
      });

      await tx.competitionTechnicalOfficialInvitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED" },
      });

      return { success: true as const };
    });

    if (result && typeof result === "object" && "error" in result && result.error) {
      const st =
        "status" in result && typeof result.status === "number" ? result.status : 400;
      return NextResponse.json({ error: result.error }, { status: st });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500(
      "POST api/technical-official-invitations/[token]/accept",
      error
    );
  }
}
