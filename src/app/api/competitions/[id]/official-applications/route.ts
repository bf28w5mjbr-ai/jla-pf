import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import {
  isQualificationExpired,
  normalizeQualificationKind,
} from "@/lib/qualificationTemplateRules";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        status: true,
        entryStartDate: true,
        entryEndDate: true,
        officialRecruitmentEnabled: true,
        officialQualificationFilterEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        organization: {
          select: {
            admins: {
              where: { userId: session.userId },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const isHostAdmin = hasOrgAdminAccess(competition.organization.admins);
    if (competition.status === "DRAFT" && !isHostAdmin) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (competition.status === "CANCELLED") {
      return NextResponse.json(
        { error: "この大会は中止のため応募できません" },
        { status: 400 }
      );
    }
    if (!competition.officialRecruitmentEnabled) {
      return NextResponse.json(
        { error: "現在オフィシャル募集は停止中です" },
        { status: 400 }
      );
    }

    const now = new Date();
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;
    if (!entryWindowOpen && !isHostAdmin) {
      return NextResponse.json(
        { error: "競技者エントリー受付期間外のため、オフィシャル応募はできません" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      message?: unknown;
      entryType?: unknown;
      clubId?: unknown;
    } | null;
    const messageRaw = typeof body?.message === "string" ? body.message.trim() : "";
    const message = messageRaw.length > 0 ? messageRaw.slice(0, 2000) : null;
    const entryType = body?.entryType === "TECHNICAL" ? "TECHNICAL" : "GENERAL";
    const clubId = typeof body?.clubId === "string" ? body.clubId.trim() : "";

    let positionName = "オフィシャル";
    if (entryType === "TECHNICAL") {
      if (!competition.technicalOfficialRecruitmentEnabled) {
        return NextResponse.json(
          { error: "この大会ではテクニカルオフィシャル機能が無効です" },
          { status: 400 }
        );
      }
      if (!clubId) {
        return NextResponse.json({ error: "TO応募にはクラブ選択が必要です" }, { status: 400 });
      }
      const [club, individualEntryExists, teamEntryExists] = await Promise.all([
        prisma.club.findUnique({
          where: { id: clubId },
          select: { id: true, name: true },
        }),
        prisma.competitionEntry.findFirst({
          where: {
            competitionId,
            clubId,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        }),
        prisma.teamEntry.findFirst({
          where: {
            competitionId,
            clubId,
          },
          select: { id: true },
        }),
      ]);
      if (!club || (!individualEntryExists && !teamEntryExists)) {
        return NextResponse.json(
          { error: "選択したクラブはこの大会の参加確定クラブではありません" },
          { status: 400 }
        );
      }
      positionName = `テクニカルオフィシャル（${club.name}）`;
    }

    if (competition.officialQualificationFilterEnabled) {
      const requiredKinds = ["BLS", "WaterSafety"];
      const refereeKinds = ["RefereeC", "RefereeB", "RefereeA", "RefereeS"];
      const allKinds = [...requiredKinds, ...refereeKinds];

      const [templates, userQualifications] = await Promise.all([
        prisma.qualificationTemplate.findMany({
          where: { kind: { in: allKinds } },
          select: { kind: true, name: true },
        }),
        prisma.qualification.findMany({
          where: {
            userId: session.userId,
            status: "APPROVED",
          },
          select: {
            kind: true,
            expiryDate: true,
          },
        }),
      ]);

      const availableKindSet = new Set(templates.map((t) => normalizeQualificationKind(t.kind)));
      const hasTemplateCoverage = allKinds.every((k) =>
        availableKindSet.has(normalizeQualificationKind(k))
      );
      if (!hasTemplateCoverage) {
        return NextResponse.json(
          { error: "現在この大会の応募資格を確認できません。主催者へお問い合わせください。" },
          { status: 400 }
        );
      }

      const approvedValidKindSet = new Set(
        userQualifications
          .filter((q) => !isQualificationExpired(q.expiryDate))
          .map((q) => normalizeQualificationKind(q.kind))
      );

      const missingRequired = requiredKinds.filter(
        (kind) => !approvedValidKindSet.has(normalizeQualificationKind(kind))
      );
      const hasAnyReferee = refereeKinds.some((kind) =>
        approvedValidKindSet.has(normalizeQualificationKind(kind))
      );

      if (missingRequired.length > 0 || !hasAnyReferee) {
        const nameOf = (kind: string) =>
          templates.find((t) => normalizeQualificationKind(t.kind) === normalizeQualificationKind(kind))
            ?.name ?? kind;
        const missingLabel = missingRequired.map(nameOf).join(" / ");
        const refereeLabel = refereeKinds.map(nameOf).join(" / ");
        return NextResponse.json(
          {
            error:
              missingRequired.length > 0
                ? `応募には ${missingLabel} の承認済み資格が必要です`
                : `応募には審判資格（${refereeLabel} のいずれか）の承認済み資格が必要です`,
          },
          { status: 403 }
        );
      }
    }

    const existing = await prisma.competitionOfficialApplication.findUnique({
      where: {
        competitionId_userId: { competitionId, userId: session.userId },
      },
    });

    if (existing?.status === "PENDING") {
      return NextResponse.json(
        { error: "すでに応募済みです（審査中）" },
        { status: 409 }
      );
    }
    if (existing?.status === "APPROVED") {
      return NextResponse.json({ error: "すでに承認済みです" }, { status: 409 });
    }

    const data = {
      positionName,
      message,
      status: "PENDING" as const,
      reviewedAt: null,
      reviewedByUserId: null,
    };

    const row =
      existing?.status === "REJECTED"
        ? await prisma.competitionOfficialApplication.update({
            where: { id: existing.id },
            data,
          })
        : await prisma.competitionOfficialApplication.create({
            data: {
              competitionId,
              userId: session.userId,
              positionName,
              message,
            },
          });

    return NextResponse.json({ success: true, application: row });
  } catch (e) {
    return jsonInternalError500("POST api/competitions/[id]/official-applications/route.ts", e);
  }
}
