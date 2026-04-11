export const runtime = "nodejs";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireClubAdmin } from "@/lib/accessControl";
import { isClubAdminRole } from "@/lib/roleScopes";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { createNotification } from "@/lib/notificationService";
import { isValidJapaneseMobile, toE164 } from "@/lib/phone";
import {
  countClubIndividualEntryRows,
  countValidTechnicalOfficialAssignments,
  getTechnicalOfficialStatusForClub,
} from "@/lib/technicalOfficialQueries";
import {
  hasRequiredOfficialQualifications,
  parseTechnicalOfficialTiers,
  requiredTechnicalOfficialCount,
} from "@/lib/technicalOfficialRules";
import { buildTechnicalOfficialInviteSmsMessage } from "@/lib/technicalOfficialSms";
import { sendSecurityNoticeSms } from "@/lib/sns";
import { isSmsOutboundHeld } from "@/lib/smsHoldPolicy";

type PostBody = {
  memberUserId?: string;
  smsPhone?: string;
};

function newInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ clubId: string; competitionId: string }> }
) {
  try {
    const { clubId, competitionId } = await context.params;
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

    const body = (await request.json().catch(() => ({}))) as PostBody;
    const memberUserId =
      typeof body.memberUserId === "string" ? body.memberUserId.trim() : "";
    const smsPhone = typeof body.smsPhone === "string" ? body.smsPhone.trim() : "";

    if ((!memberUserId && !smsPhone) || (memberUserId && smsPhone)) {
      return NextResponse.json(
        { error: "メンバー指定またはSMSのどちらか一方を指定してください" },
        { status: 400 }
      );
    }

    if (smsPhone && !memberUserId && isSmsOutboundHeld()) {
      return NextResponse.json(
        {
          error:
            "SMS送信を保留しているため、携帯番号へのSMS招待は利用できません。メンバー指定の招待をご利用ください。",
        },
        { status: 503 }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        officialQualificationFilterEnabled: true,
        technicalOfficialTiers: true,
      },
    });

    if (!competition?.officialRecruitmentEnabled || !competition?.technicalOfficialRecruitmentEnabled) {
      return NextResponse.json(
        { error: "この大会ではテクニカルオフィシャル機能がOFFです" },
        { status: 400 }
      );
    }

    const tiers = parseTechnicalOfficialTiers(competition.technicalOfficialTiers);
    if (tiers.length === 0) {
      return NextResponse.json(
        { error: "段階設定が未登録です（主催者が設定するまで依頼できません）" },
        { status: 400 }
      );
    }

    const entryCount = await countClubIndividualEntryRows(prisma, competitionId, clubId);
    const required = requiredTechnicalOfficialCount(entryCount, tiers);
    if (required <= 0) {
      return NextResponse.json(
        { error: "現在の個人エントリー件数ではテクニカルオフィシャルは不要です" },
        { status: 400 }
      );
    }

    const assigned = await countValidTechnicalOfficialAssignments(
      prisma,
      competitionId,
      clubId,
      Boolean(competition.officialQualificationFilterEnabled)
    );
    const pendingCount = await prisma.competitionTechnicalOfficialInvitation.count({
      where: {
        competitionId,
        clubId,
        status: "PENDING",
      },
    });
    if (assigned + pendingCount >= required) {
      return NextResponse.json(
        { error: "既に必要人数分の任命または招待が出ています。不要な招待を取り消してから再度お試しください。" },
        { status: 400 }
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    });
    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    if (memberUserId) {
      if (memberUserId === session.userId) {
        return NextResponse.json({ error: "自分自身には依頼できません" }, { status: 400 });
      }

      const membership = await prisma.membership.findFirst({
        where: {
          clubId,
          userId: memberUserId,
          status: "APPROVED",
        },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "このクラブの承認済みメンバーではありません" },
          { status: 400 }
        );
      }

      const existingAssignment = await prisma.competitionTechnicalOfficialAssignment.findUnique({
        where: {
          competitionId_clubId_userId: {
            competitionId,
            clubId,
            userId: memberUserId,
          },
        },
        select: { id: true },
      });
      if (existingAssignment) {
        return NextResponse.json({ error: "すでに任命済みのメンバーです" }, { status: 400 });
      }

      const dupPending = await prisma.competitionTechnicalOfficialInvitation.findFirst({
        where: {
          competitionId,
          clubId,
          status: "PENDING",
          invitedUserId: memberUserId,
        },
        select: { id: true },
      });
      if (dupPending) {
        return NextResponse.json({ error: "すでに招待中です" }, { status: 400 });
      }

      const inviteToken = newInviteToken();
      const inv = await prisma.competitionTechnicalOfficialInvitation.create({
        data: {
          token: inviteToken,
          competitionId,
          clubId,
          invitedByUserId: session.userId,
          invitedUserId: memberUserId,
          status: "PENDING",
        },
      });

      await createNotification({
        userId: memberUserId,
        category: "COMPETITION",
        type: "TECHNICAL_OFFICIAL_INVITE",
        title: "テクニカルオフィシャルの依頼",
        body: `${club.name}から「${competition.name}」のテクニカルオフィシャルとしての依頼が届きました。内容を確認し、承認または辞退してください。`,
        relatedId: inv.id,
        linkUrl: `/invite/technical-official/${inviteToken}`,
      });

      return NextResponse.json({
        success: true,
        invitationId: inv.id,
        kind: "member",
      });
    }

    if (!isValidJapaneseMobile(smsPhone)) {
      return NextResponse.json(
        { error: "SMS送信には有効な日本国内携帯番号を入力してください" },
        { status: 400 }
      );
    }

    let phoneE164: string;
    try {
      phoneE164 = toE164(smsPhone);
    } catch {
      return NextResponse.json({ error: "電話番号の形式が不正です" }, { status: 400 });
    }

    const dupPhone = await prisma.competitionTechnicalOfficialInvitation.findFirst({
      where: {
        competitionId,
        clubId,
        status: "PENDING",
        invitePhoneE164: phoneE164,
      },
      select: { id: true },
    });
    if (dupPhone) {
      return NextResponse.json({ error: "この番号にはすでに招待中です" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: phoneE164 },
      select: { id: true },
    });
    if (existingUser) {
      const existingAssignment = await prisma.competitionTechnicalOfficialAssignment.findUnique({
        where: {
          competitionId_clubId_userId: {
            competitionId,
            clubId,
            userId: existingUser.id,
          },
        },
        select: { id: true },
      });
      if (existingAssignment) {
        return NextResponse.json(
          { error: "この番号のユーザーはすでに任命済みです。メンバー招待をご利用ください。" },
          { status: 400 }
        );
      }
    }

    const inviteToken = newInviteToken();
    const inv = await prisma.competitionTechnicalOfficialInvitation.create({
      data: {
        token: inviteToken,
        competitionId,
        clubId,
        invitedByUserId: session.userId,
        invitePhoneE164: phoneE164,
        status: "PENDING",
      },
    });

    const message = buildTechnicalOfficialInviteSmsMessage({
      clubName: club.name,
      competitionName: competition.name,
      token: inviteToken,
    });

    try {
      await sendSecurityNoticeSms(phoneE164, message);
    } catch (e) {
      await prisma.competitionTechnicalOfficialInvitation.delete({ where: { id: inv.id } });
      throw e;
    }

    return NextResponse.json({
      success: true,
      invitationId: inv.id,
      kind: "sms",
    });
  } catch (error) {
    return jsonInternalError500(
      "POST api/clubs/.../technical-official/invitations",
      error
    );
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string; competitionId: string }> }
) {
  try {
    const { clubId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    const viewerMembership = await prisma.membership.findFirst({
      where: { clubId, userId: session.userId, status: "APPROVED" },
      select: { role: true },
    });
    if (!viewerMembership) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    const viewerIsAdmin = isClubAdminRole(viewerMembership.role);

    const status = await getTechnicalOfficialStatusForClub(prisma, competitionId, clubId);
    if (!status) {
      return NextResponse.json({ configured: false });
    }

    const invitations = await prisma.competitionTechnicalOfficialInvitation.findMany({
      where: { competitionId, clubId },
      orderBy: { createdAt: "desc" },
      include: {
        invitedUser: {
          select: { id: true, familyName: true, givenName: true },
        },
      },
    });

    const approvedMembers = await prisma.membership.findMany({
      where: { clubId, status: "APPROVED" },
      include: {
        user: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
            qualifications: {
              select: { kind: true, status: true, expiryDate: true },
            },
          },
        },
      },
    });

    const requireQualificationFilter = Boolean(status.qualificationFilterEnabled);
    const eligibleMembers = viewerIsAdmin
      ? approvedMembers
          .filter((m) => m.user.id !== session.userId)
          .filter((m) =>
            requireQualificationFilter
              ? hasRequiredOfficialQualifications(
                  m.user.qualifications.map((q) => ({
                    kind: q.kind,
                    status: q.status,
                    expiryDate: q.expiryDate,
                  }))
                )
              : true
          )
          .map((m) => ({
            id: m.user.id,
            name: `${m.user.familyName} ${m.user.givenName}`,
          }))
      : [];

    return NextResponse.json({
      configured: status.configured,
      status,
      invitations: invitations.map((i) => ({
        id: i.id,
        status: i.status,
        invitePhoneE164: viewerIsAdmin ? i.invitePhoneE164 : null,
        smsInvite: Boolean(i.invitePhoneE164) && !i.invitedUser,
        invitedUser: i.invitedUser,
        createdAt: i.createdAt.toISOString(),
      })),
      eligibleMembers,
      viewerIsAdmin,
    });
  } catch (error) {
    return jsonInternalError500(
      "GET api/clubs/.../technical-official/invitations",
      error
    );
  }
}
