// src/app/api/qualifications/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { Prisma, QualificationRecordOrigin, QualificationStatus } from "@prisma/client";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import {
  matchesQualificationKeywords,
  resolveQualificationTemplateForKindInput,
} from "@/lib/qualificationKindMatch";
import {
  evaluatePrerequisiteExpression,
  isQualificationExpired,
  normalizeQualificationKind,
  resolveQualificationTemplateMeta,
} from "@/lib/qualificationTemplateRules";

const DEFAULT_QUALIFICATION_PAGE_LIMIT = 20;
const MAX_QUALIFICATION_PAGE_LIMIT = 200;

function clampQualificationPagination(limitRaw: number, offsetRaw: number): {
  limit: number;
  offset: number;
} {
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(Math.floor(limitRaw), MAX_QUALIFICATION_PAGE_LIMIT)
      : DEFAULT_QUALIFICATION_PAGE_LIMIT;
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
}

// GET /api/qualifications - 資格一覧取得
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const kind = searchParams.get('kind');
    const status = searchParams.get('status'); // 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
    const { limit, offset } = clampQualificationPagination(
      parseInt(searchParams.get("limit") || String(DEFAULT_QUALIFICATION_PAGE_LIMIT), 10),
      parseInt(searchParams.get("offset") || "0", 10)
    );

    const where: Prisma.QualificationWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    if (kind) {
      where.kind = kind;
    }

    if (
      status &&
      ["PENDING", "APPROVED", "REJECTED", "EXPIRED"].includes(status)
    ) {
      where.status = status as QualificationStatus;
    }

    const [qualifications, total] = await Promise.all([
      prisma.qualification.findMany({
        where,
        include: {
          template: true,
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { familyName: true, givenName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.qualification.count({ where }),
    ]);

    return NextResponse.json({
      qualifications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    return jsonInternalError500("GET api/qualifications/route.ts", err);
  }
}

// POST /api/qualifications - 資格の即時紐づけ（APPROVED）
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const CreateQualificationSchema = z.object({
      kind: z.string().min(1),
      provisionalLink: z.boolean().optional().default(false),
      certNumber: z
        .string()
        .optional()
        .transform((value) => {
          if (typeof value !== "string") return undefined;
          const normalized = value.trim();
          return normalized === "" ? undefined : normalized;
        }),
      jlaMemberNumber: z
        .string()
        .optional()
        .transform((value) => {
          if (typeof value !== "string") return undefined;
          const normalized = normalizeJlaMemberNumber(value);
          return normalized === "" ? undefined : normalized;
        }),
      issueDate: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      attachmentUrl: z.string().url().optional(),
    });

    const data = CreateQualificationSchema.parse(body);
    const isProvisionalLink = data.provisionalLink === true;

    const templates = await prisma.qualificationTemplate.findMany({
      select: {
        kind: true,
        id: true,
        name: true,
        description: true,
        domain: true,
        level: true,
        minAge: true,
        prerequisiteExpression: true,
        nextKinds: true,
      },
    });
    const requestedTemplate =
      resolveQualificationTemplateForKindInput(templates, data.kind) ?? null;

    if (!requestedTemplate) {
      return NextResponse.json(
        { error: "指定された資格は登録できません。資格一覧から選択してください。" },
        { status: 400 }
      );
    }
    const requestedKind = requestedTemplate.kind;
    const templateMeta = resolveQualificationTemplateMeta(requestedTemplate);

    const userForValidation = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: {
        profile: { select: { dateOfBirth: true } },
        jlaProfile: { select: { jlaMemberNumber: true } },
        qualifications: {
          where: { status: "APPROVED" },
          select: {
            kind: true,
            status: true,
            issueDate: true,
            expiryDate: true,
            createdAt: true,
          },
        },
      },
    });
    if (!userForValidation) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const fromBody = data.jlaMemberNumber;
    const fromProfile = userForValidation.jlaProfile?.jlaMemberNumber?.trim()
      ? normalizeJlaMemberNumber(userForValidation.jlaProfile.jlaMemberNumber)
      : "";

    let effectiveJlaMemberNumber: string;
    if (fromProfile && isValidJlaMemberNumber(fromProfile)) {
      if (fromBody && fromBody !== fromProfile) {
        return NextResponse.json(
          {
            error:
              "アカウントに登録されたJLAメンバーIDと異なる値が送られました。プロフィールの「資格の管理」でメンバーIDを確認してください。",
          },
          { status: 400 }
        );
      }
      effectiveJlaMemberNumber = fromProfile;
    } else {
      if (!fromBody) {
        return NextResponse.json(
          {
            error:
              "資格の紐づけにはJLAメンバーIDが必要です。マイアカウントの「資格の管理」でメンバーIDを登録するか、入力してください。",
          },
          { status: 400 }
        );
      }
      effectiveJlaMemberNumber = fromBody;
    }

    if (!isValidJlaMemberNumber(effectiveJlaMemberNumber)) {
      return NextResponse.json(
        { error: "JLAメンバーIDは500から始まる9桁の半角数字で入力してください" },
        { status: 400 }
      );
    }

    if (!isProvisionalLink && typeof templateMeta.minAge === "number") {
      const today = new Date();
      const dob = new Date(userForValidation.profile?.dateOfBirth ?? 0);
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
      if (age < templateMeta.minAge) {
        return NextResponse.json(
          { error: `${requestedKind} は ${templateMeta.minAge}歳以上が必要です` },
          { status: 400 }
        );
      }
    }

    const existingQualifications = await prisma.qualification.findMany({
      where: {
        userId: sess.userId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        id: true,
        kind: true,
        templateId: true,
        certNumber: true,
        issueDate: true,
        status: true,
        expiryDate: true,
        attachmentUrl: true,
        recordOrigin: true,
      },
    });

    const existingMatch = existingQualifications.find((qualification) =>
      qualification.templateId === requestedTemplate.id ||
      matchesQualificationKeywords(qualification.kind, [
        requestedTemplate.kind,
        requestedTemplate.name,
      ])
    );

    if (existingMatch) {
      if (existingMatch.status === "APPROVED") {
        return NextResponse.json(
          { error: "既にこの資格を保有しています" },
          { status: 400 }
        );
      }
    }

    if (!isProvisionalLink && requestedKind === "BLS・WS") {
      const lifesaverQualification = existingQualifications.find((qualification) =>
        matchesQualificationKeywords(qualification.kind, [
          "認定ライフセーバー",
          "certified lifesaver",
          "cls",
        ])
      );

      if (lifesaverQualification?.status === "APPROVED") {
        const expiryDate = lifesaverQualification.expiryDate
          ? new Date(lifesaverQualification.expiryDate)
          : null;
        const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false;

        if (!isExpired) {
          return NextResponse.json(
            { error: "認定ライフセーバーを保有しているためBLS・WSは不要です" },
            { status: 400 }
          );
        }
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        jlaProfile: { is: { jlaMemberNumber: effectiveJlaMemberNumber } },
        NOT: { id: sess.userId },
      },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "このJLAメンバーIDは既に別の会員に紐づいています" },
        { status: 400 }
      );
    }

    if (!isProvisionalLink && templateMeta.prerequisiteExpression) {
      const approvedValidKinds = new Set(
        userForValidation.qualifications
          .filter((q) => !isQualificationExpired(q.expiryDate))
          .map((q) => normalizeQualificationKind(q.kind))
      );
      const ok = evaluatePrerequisiteExpression(
        templateMeta.prerequisiteExpression,
        (kind) => approvedValidKinds.has(normalizeQualificationKind(kind))
      );
      if (!ok) {
        return NextResponse.json(
          { error: `前提資格を満たしていません（必要: ${templateMeta.prerequisiteExpression}）` },
          { status: 400 }
        );
      }
    }

    const levelNormalized = (templateMeta.level ?? "").toLowerCase();
    const isInstructorTrack = levelNormalized.includes("assistantinstructor") || levelNormalized === "instructor";
    if (!isProvisionalLink && isInstructorTrack) {
      const approvedValid = userForValidation.qualifications.filter(
        (q) => !isQualificationExpired(q.expiryDate)
      );
      const approvedValidKinds = new Set(
        approvedValid.map((q) => normalizeQualificationKind(q.kind))
      );
      if (approvedValidKinds.size === 0) {
        return NextResponse.json(
          { error: "指導者資格の申請には有効な資格保有が必要です" },
          { status: 400 }
        );
      }

      if (requestedKind === "BLSAssistantInstructor") {
        const nonBls = [...approvedValidKinds].filter((k) => k !== normalizeQualificationKind("BLS"));
        if (nonBls.length === 0) {
          const blsHistoryCount = await prisma.qualification.count({
            where: {
              userId: sess.userId,
              kind: "BLS",
              status: { in: ["APPROVED", "EXPIRED"] },
            },
          });
          if (blsHistoryCount < 2) {
            return NextResponse.json(
              { error: "BLSのみ保有の場合、更新履歴が1回以上必要です" },
              { status: 400 }
            );
          }
        }
      }

      if (approvedValidKinds.size >= 2) {
        const latest = approvedValid.reduce<Date | null>((acc, q) => {
          const base = q.issueDate ?? q.createdAt;
          if (!acc || base.getTime() > acc.getTime()) return base;
          return acc;
        }, null);
        if (latest) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          if (latest.getTime() > oneYearAgo.getTime()) {
            return NextResponse.json(
              { error: "複数資格保有時は、直近資格取得から1年以上経過している必要があります" },
              { status: 400 }
            );
          }
        }
      }
    }

    // 資格の即時紐づけ（APPROVED）+ アカウント（User）への JLA メンバーIDの紐付け
    const qualification = await prisma.$transaction(async (tx) => {
      let row;
      if (existingMatch?.status === "PENDING") {
        await tx.qualificationHistory.create({
          data: {
            qualificationId: existingMatch.id,
            sourceQualificationId: existingMatch.id,
            userId: sess.userId,
            templateId: existingMatch.templateId,
            kind: existingMatch.kind,
            certNumber: existingMatch.certNumber,
            issueDate: existingMatch.issueDate,
            expiryDate: existingMatch.expiryDate,
            status: existingMatch.status,
            attachmentUrl: existingMatch.attachmentUrl,
            recordOrigin: existingMatch.recordOrigin,
            changeType: "STATUS_CHANGE",
          },
        });
        row = await tx.qualification.update({
          where: { id: existingMatch.id },
          data: {
            kind: requestedKind,
            templateId: requestedTemplate.id,
            certNumber: data.certNumber ?? null,
            issueDate: data.issueDate ? new Date(data.issueDate) : null,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            status: "APPROVED",
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { familyName: true, givenName: true } },
              },
            },
          },
        });
      } else {
        row = await tx.qualification.create({
          data: {
            userId: sess.userId,
            templateId: requestedTemplate.id,
            kind: requestedKind,
            certNumber: data.certNumber ?? null,
            issueDate: data.issueDate ? new Date(data.issueDate) : null,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            status: "APPROVED",
            recordOrigin: QualificationRecordOrigin.USER_APPLICATION,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { familyName: true, givenName: true } },
              },
            },
          },
        });
      }

      await tx.user.update({
        where: { id: sess.userId },
        data: {
          jlaProfile: {
            upsert: {
              create: { jlaMemberNumber: effectiveJlaMemberNumber },
              update: { jlaMemberNumber: effectiveJlaMemberNumber },
            },
          },
        },
      });

      return row;
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: "QUALIFICATION_LINK",
        target: `qualification:${qualification.id}`,
        meta: {
          kind: requestedKind,
          templateId: requestedTemplate.id,
          certNumber: data.certNumber ?? null,
          jlaMemberNumber: effectiveJlaMemberNumber,
          provisionalLink: isProvisionalLink,
        },
      },
    });

    return NextResponse.json(qualification, { status: existingMatch?.status === "PENDING" ? 200 : 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }

    return jsonInternalError500("POST api/qualifications/route.ts", err);
  }
}
