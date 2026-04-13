// src/app/api/qualifications/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { Prisma, QualificationStatus } from "@prisma/client";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import {
  evaluatePrerequisiteExpression,
  isQualificationExpired,
  normalizeQualificationKind,
  parseQualificationTemplateMeta,
} from "@/lib/qualificationTemplateRules";

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
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

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
          user: {
            select: {
              id: true,
              email: true,
              givenName: true,
              familyName: true,
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

// POST /api/qualifications - 資格申請
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
          const normalized = normalizeJlaMemberNumber(value);
          return normalized === "" ? undefined : normalized;
        }),
      issueDate: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      attachmentUrl: z.string().url().optional(),
    });

    const data = CreateQualificationSchema.parse(body);
    const isProvisionalLink = data.provisionalLink === true;

    const matchesKeywords = (value: string | null | undefined, keywords: string[]) => {
      const normalizedValue = normalizeQualificationKind(value);
      if (!normalizedValue) return false;
      return keywords.some((keyword) => {
        const normalizedKeyword = normalizeQualificationKind(keyword);
        return (
          normalizedValue === normalizedKeyword ||
          normalizedValue.includes(normalizedKeyword) ||
          normalizedKeyword.includes(normalizedValue)
        );
      });
    };

    const templates = await prisma.qualificationTemplate.findMany({
      select: {
        kind: true,
        name: true,
        description: true,
      },
    });
    const requestedTemplate =
      templates.find(
        (template) =>
          matchesKeywords(data.kind, [template.kind]) ||
          matchesKeywords(data.kind, [template.name])
      ) ?? null;

    if (!requestedTemplate) {
      return NextResponse.json(
        { error: "指定された資格は登録できません。資格一覧から選択してください。" },
        { status: 400 }
      );
    }
    const requestedKind = requestedTemplate.kind;
    const templateMeta = parseQualificationTemplateMeta(requestedTemplate.description);

    const userForValidation = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: {
        jlaMemberNumber: true,
        dateOfBirth: true,
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

    const fromBody = data.certNumber;
    const fromProfile = userForValidation.jlaMemberNumber?.trim()
      ? normalizeJlaMemberNumber(userForValidation.jlaMemberNumber)
      : "";

    let effectiveCert: string;
    if (fromProfile && isValidJlaMemberNumber(fromProfile)) {
      if (fromBody && fromBody !== fromProfile) {
        return NextResponse.json(
          {
            error:
              "アカウントに登録されたJLAメンバーIDと異なる値が送られました。プロフィールの「保有資格」でメンバーIDを確認してください。",
          },
          { status: 400 }
        );
      }
      effectiveCert = fromProfile;
    } else {
      if (!fromBody) {
        return NextResponse.json(
          {
            error:
              "資格申請にはJLAメンバーIDが必要です。マイアカウントの「保有資格」でメンバーIDを登録するか、申請時に入力してください。",
          },
          { status: 400 }
        );
      }
      effectiveCert = fromBody;
    }

    if (!isValidJlaMemberNumber(effectiveCert)) {
      return NextResponse.json(
        { error: "JLAメンバーIDは500から始まる9桁の半角数字で入力してください" },
        { status: 400 }
      );
    }

    if (!isProvisionalLink && typeof templateMeta.minAge === "number") {
      const today = new Date();
      const dob = new Date(userForValidation.dateOfBirth);
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
        status: true,
        expiryDate: true,
      },
    });

    const existingMatch = existingQualifications.find((qualification) =>
      matchesKeywords(qualification.kind, [requestedTemplate.kind, requestedTemplate.name])
    );

    if (existingMatch) {
      if (existingMatch.status === "APPROVED") {
        return NextResponse.json(
          { error: "既にこの資格を保有しています" },
          { status: 400 }
        );
      }
      // 旧データの PENDING は再送時にそのまま承認済みへ更新する（審査フロー廃止後の取りこぼし解消）
    }

    if (!isProvisionalLink && requestedKind === "BLS・WS") {
      const lifesaverQualification = existingQualifications.find((qualification) =>
        matchesKeywords(qualification.kind, ["認定ライフセーバー", "certified lifesaver", "cls"])
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
        jlaMemberNumber: effectiveCert,
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

    const existingQualificationWithNumber = await prisma.qualification.findFirst({
      where: {
        certNumber: effectiveCert,
        status: { in: ["PENDING", "APPROVED"] },
        NOT: { userId: sess.userId },
      },
      select: {
        id: true,
        kind: true,
      },
    });

    if (existingQualificationWithNumber) {
      return NextResponse.json(
        { error: "このJLAメンバーIDは既に別の会員の申請で使用されています" },
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

    // 資格登録（承認不要・即時有効）+ アカウント（User）への JLA メンバーIDの紐付け
    const qualification = await prisma.$transaction(async (tx) => {
      if (existingMatch?.status === "PENDING") {
        const updated = await tx.qualification.update({
          where: { id: existingMatch.id },
          data: {
            kind: requestedKind,
            certNumber: effectiveCert,
            issueDate: data.issueDate ? new Date(data.issueDate) : null,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            status: "APPROVED",
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                givenName: true,
                familyName: true,
              },
            },
          },
        });
        await tx.user.update({
          where: { id: sess.userId },
          data: { jlaMemberNumber: effectiveCert },
        });
        return updated;
      }

      const created = await tx.qualification.create({
        data: {
          userId: sess.userId,
          kind: requestedKind,
          certNumber: effectiveCert,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          status: "APPROVED",
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              givenName: true,
              familyName: true,
            },
          },
        },
      });

      await tx.user.update({
        where: { id: sess.userId },
        data: { jlaMemberNumber: effectiveCert },
      });

      return created;
    });

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: "QUALIFICATION_APPLY",
        target: `qualification:${qualification.id}`,
        meta: {
          kind: requestedKind,
          certNumber: effectiveCert,
          provisionalLink: isProvisionalLink,
          autoApproved: true,
        },
      },
    });

    return NextResponse.json(qualification, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }

    return jsonInternalError500("POST api/qualifications/route.ts", err);
  }
}
