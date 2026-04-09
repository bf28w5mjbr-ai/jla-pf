import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  announceCompetitionRuleChange,
  assertEntrySettingsChange,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import {
  assertEntryPledgeTextLength,
  normalizeEntryPledgeText,
} from "@/lib/entryPledge";
import { isOrgAdminRole } from "@/lib/roleScopes";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const {
      entryStartDate,
      entryEndDate,
      allowMultipleEventEntries,
      maxEventEntriesPerPerson,
      requireClubMembership,
      minAge,
      maxAge,
    } = body;

    // 大会の存在確認と権限チェック
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        organization: {
          include: {
            admins: {
              where: { userId: session.userId },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    // 権限チェック（管理者のみ）
    const isAdmin = competition.organization.admins.some(
      (admin) =>
        admin.userId === session.userId &&
        isOrgAdminRole(admin.role)
    );

    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    try {
      assertEntrySettingsChange(competition, body, mutationState);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    const data: Prisma.CompetitionUpdateInput = {};
    if ("entryStartDate" in body) {
      data.entryStartDate =
        typeof entryStartDate === "string" && entryStartDate
          ? new Date(entryStartDate)
          : null;
    }
    if ("entryEndDate" in body) {
      data.entryEndDate =
        typeof entryEndDate === "string" && entryEndDate ? new Date(entryEndDate) : null;
    }
    if ("allowMultipleEventEntries" in body) {
      if (typeof allowMultipleEventEntries === "boolean") {
        data.allowMultipleEventEntries = allowMultipleEventEntries;
      }
    }
    if ("maxEventEntriesPerPerson" in body) {
      if (typeof maxEventEntriesPerPerson === "number") {
        data.maxEventEntriesPerPerson = maxEventEntriesPerPerson;
      } else if (maxEventEntriesPerPerson === null) {
        data.maxEventEntriesPerPerson = null;
      }
    }
    if ("requireClubMembership" in body) {
      if (typeof requireClubMembership === "boolean") {
        data.requireClubMembership = requireClubMembership;
      }
    }
    if ("minAge" in body) {
      data.minAge =
        typeof minAge === "number" ? minAge : minAge === null ? null : undefined;
    }
    if ("maxAge" in body) {
      data.maxAge =
        typeof maxAge === "number" ? maxAge : maxAge === null ? null : undefined;
    }

    const pledgeTouched =
      "entryPledgeEnabled" in body || "entryPledgeText" in body;
    if (pledgeTouched) {
      const nextEnabled =
        typeof body.entryPledgeEnabled === "boolean"
          ? body.entryPledgeEnabled
          : competition.entryPledgeEnabled;
      const nextText =
        typeof body.entryPledgeText === "string"
          ? normalizeEntryPledgeText(body.entryPledgeText)
          : (competition.entryPledgeText ?? "").trim();

      if (competition.entryPledgeLockNoOffer && nextEnabled) {
        return NextResponse.json(
          {
            message:
              "公開時に誓約を有効にしていないため、後から有効化できません",
          },
          { status: 400 }
        );
      }

      if (nextEnabled && !nextText) {
        return NextResponse.json(
          { message: "誓約を有効にする場合は誓約文を入力してください" },
          { status: 400 }
        );
      }
      if (nextText) {
        try {
          assertEntryPledgeTextLength(nextText);
        } catch (e) {
          return NextResponse.json(
            { message: e instanceof Error ? e.message : "誓約文が長すぎます" },
            { status: 400 }
          );
        }
      }

      if (typeof body.entryPledgeEnabled === "boolean") {
        data.entryPledgeEnabled = body.entryPledgeEnabled;
      }
      if (typeof body.entryPledgeText === "string") {
        data.entryPledgeText = nextText || null;
      } else if (
        typeof body.entryPledgeEnabled === "boolean" &&
        body.entryPledgeEnabled
      ) {
        data.entryPledgeText = nextText || null;
      }
    }

    const announce =
      typeof body.announcementMessage === "string"
        ? body.announcementMessage.trim()
        : "";

    if (Object.keys(data).length === 0) {
      if (announce && mutationState.isPublished && mutationState.hasEstablishedEntry) {
        await announceCompetitionRuleChange({
          competitionId,
          title: `${competition.name} のエントリー設定が更新されました`,
          body: announce,
        });
      }
      const unchanged = await prisma.competition.findUnique({
        where: { id: competitionId },
      });
      return NextResponse.json({
        message: "変更はありませんでした",
        competition: unchanged,
      });
    }

    const updatedCompetition = await prisma.competition.update({
      where: { id: competitionId },
      data,
    });

    if (announce && mutationState.isPublished && mutationState.hasEstablishedEntry) {
      await announceCompetitionRuleChange({
        competitionId,
        title: `${competition.name} のエントリー設定が更新されました`,
        body: announce,
      });
    }

    return NextResponse.json({
      message: "エントリー設定を更新しました",
      competition: updatedCompetition,
    });
  } catch (error) {
    return jsonInternalError500("PUT api/competitions/[id]/entry-settings/route.ts", error);
  }
}
