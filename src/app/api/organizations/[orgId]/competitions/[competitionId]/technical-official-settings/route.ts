export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { parseTechnicalOfficialTiers } from "@/lib/technicalOfficialRules";

type PutBody = {
  technicalOfficialTiers?: unknown;
  technicalOfficialRecruitmentEnabled?: unknown;
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const existing = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId },
      select: {
        id: true,
        officialRecruitmentEnabled: true,
        technicalOfficialRecruitmentEnabled: true,
        technicalOfficialTiers: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as PutBody;

    let tiersJson: unknown = undefined;
    if ("technicalOfficialTiers" in body) {
      tiersJson = body.technicalOfficialTiers;
    }
    let technicalOfficialRecruitmentEnabled: boolean | undefined;
    if ("technicalOfficialRecruitmentEnabled" in body) {
      if (typeof body.technicalOfficialRecruitmentEnabled !== "boolean") {
        return NextResponse.json({ error: "TO機能の設定値が不正です" }, { status: 400 });
      }
      if (body.technicalOfficialRecruitmentEnabled === true && !existing.officialRecruitmentEnabled) {
        return NextResponse.json(
          { error: "先にオフィシャル募集をONにしてください" },
          { status: 400 }
        );
      }
      technicalOfficialRecruitmentEnabled = body.technicalOfficialRecruitmentEnabled;
    }

    if (tiersJson !== undefined && tiersJson !== null) {
      if (!Array.isArray(tiersJson)) {
        return NextResponse.json({ error: "段階設定の形式が不正です" }, { status: 400 });
      }
      const parsed = parseTechnicalOfficialTiers(tiersJson);
      if (parsed.length === 0 && tiersJson.length > 0) {
        return NextResponse.json({ error: "段階設定を確認してください" }, { status: 400 });
      }
      const minKeys = parsed.map((t) => t.minEntries);
      if (new Set(minKeys).size !== minKeys.length) {
        return NextResponse.json(
          { error: "同じエントリー件数の段階が重複しています" },
          { status: 400 }
        );
      }
      for (const t of parsed) {
        if (!Number.isInteger(t.minEntries) || !Number.isInteger(t.requiredCount)) {
          return NextResponse.json(
            { error: "人数・件数は整数で入力してください" },
            { status: 400 }
          );
        }
        if (t.minEntries < 1 || t.requiredCount < 0) {
          return NextResponse.json(
            { error: "エントリー件数は1以上、必要人数は0以上にしてください" },
            { status: 400 }
          );
        }
      }
    }

    const data: Prisma.CompetitionUpdateInput = {};

    if (technicalOfficialRecruitmentEnabled !== undefined) {
      data.technicalOfficialRecruitmentEnabled = technicalOfficialRecruitmentEnabled;
    }
    if (tiersJson !== undefined) {
      data.technicalOfficialTiers =
        tiersJson === null ? Prisma.JsonNull : (tiersJson as Prisma.InputJsonValue);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
    }

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data,
      select: {
        technicalOfficialRecruitmentEnabled: true,
        technicalOfficialTiers: true,
      },
    });

    return NextResponse.json({ success: true, competition: updated });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/organizations/.../technical-official-settings",
      error
    );
  }
}
