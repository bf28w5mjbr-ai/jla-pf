import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { EventCategory, EventType, Prisma, Sex } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import {
  announceCompetitionRuleChange,
  assertEventAddAllowed,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { resolveCompetitionEventCategoryScope } from "@/lib/competitionEventCategoryScope";
import { buildStoredCompetitionEventName } from "@/lib/competitionEventStoredName";
import {
  parseEventCreateTeamFields,
  resolveEventCreateEligibility,
} from "@/lib/competitionEventCreateFields";
import {
  parseEventSexOption,
  sexesForSexOption,
  type EventSexOption,
} from "@/lib/competitionEventSexOption";

type BulkItem = {
  name: string;
  type: EventType;
  category: EventCategory;
  sexOption: EventSexOption;
  announcementMessage?: string;
  rawBody: Record<string, unknown>;
};

type WorkingEvent = {
  name: string;
  nameLower: string;
  type: EventType;
  category: EventCategory;
  sex: Sex;
  ageCategoryId: string | null;
};

function parseItem(raw: unknown): BulkItem | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "種目の指定が不正です" };
  }
  const o = raw as Record<string, unknown>;
  const name = o.name;
  const type = o.type ?? "INDIVIDUAL";
  const category = o.category ?? "POOL";
  const sexOption = parseEventSexOption(o.sexOption ?? "BOTH");

  if (!name || typeof name !== "string" || !name.trim()) {
    return { error: "種目名を入力してください" };
  }
  if (type !== "INDIVIDUAL" && type !== "TEAM") {
    return { error: "種目タイプが不正です" };
  }
  if (category !== "POOL" && category !== "OCEAN") {
    return { error: "競技カテゴリが不正です" };
  }
  if (!sexOption) {
    return { error: "性別指定が不正です" };
  }

  return {
    name: name.trim(),
    type,
    category,
    sexOption,
    announcementMessage:
      typeof o.announcementMessage === "string" ? o.announcementMessage : undefined,
    rawBody: o,
  };
}

/** デフォルト種目一括追加など: 複数種目を 1 リクエスト・1 トランザクションで作成 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await context.params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      items?: unknown;
      ageCategoryId?: unknown;
    } | null;
    const rawItems = body?.items;
    const bulkAgeCategoryId =
      typeof body?.ageCategoryId === "string" && body.ageCategoryId.trim()
        ? body.ageCategoryId.trim()
        : null;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ message: "items が必要です" }, { status: 400 });
    }

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
        events: {
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
    }

    let resolvedBulkAgeCategory: Awaited<
      ReturnType<typeof prisma.competitionAgeCategory.findFirst>
    > = null;
    if (bulkAgeCategoryId) {
      resolvedBulkAgeCategory = await prisma.competitionAgeCategory.findFirst({
        where: { id: bulkAgeCategoryId, competitionId },
      });
      if (!resolvedBulkAgeCategory) {
        return NextResponse.json({ message: "年齢カテゴリが見つかりません" }, { status: 404 });
      }
    }

    const isAdmin = competition.organization.admins.some(
      (admin) => admin.userId === session.userId && isOrgAdminRole(admin.role)
    );
    if (!isAdmin) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const categoryScope = resolveCompetitionEventCategoryScope(competition.category);
    const mutationState = await loadCompetitionMutationState(competitionId);

    const working: WorkingEvent[] = competition.events.map((e) => ({
      name: e.name,
      nameLower: e.name.toLowerCase(),
      type: e.type,
      category: e.category,
      sex: e.sex,
      ageCategoryId: e.ageCategoryId ?? null,
    }));

    const bucketEvents = competition.events.filter(
      (e) => (e.ageCategoryId ?? null) === bulkAgeCategoryId
    );
    let nextOrder =
      bucketEvents.length > 0 ? Math.max(...bucketEvents.map((e) => e.displayOrder)) : -1;

    const competitionCategories = await prisma.competitionAgeCategory.findMany({
      where: { competitionId },
      select: { id: true },
    });
    const validCategoryIds = new Set(competitionCategories.map((c) => c.id));

    const creates: Prisma.EventCreateManyInput[] = [];
    const announcements: string[] = [];

    for (const raw of rawItems) {
      const parsed = parseItem(raw);
      if ("error" in parsed) {
        return NextResponse.json({ message: parsed.error }, { status: 400 });
      }
      const item = parsed;

      if (categoryScope === "POOL_ONLY" && item.category !== "POOL") {
        return NextResponse.json(
          { message: "この大会カテゴリではプール競技のみ登録できます" },
          { status: 400 }
        );
      }
      if (categoryScope === "OCEAN_ONLY" && item.category !== "OCEAN") {
        return NextResponse.json(
          { message: "この大会カテゴリではオーシャン競技のみ登録できます" },
          { status: 400 }
        );
      }

      const storedName = buildStoredCompetitionEventName({
        tabInnerName: item.name,
        ageCategoryId: bulkAgeCategoryId,
        ageCategoryName: resolvedBulkAgeCategory?.name ?? null,
      });
      const nameLower = storedName.toLowerCase();
      const sameName = working.filter(
        (e) =>
          e.nameLower === nameLower &&
          e.type === item.type &&
          e.category === item.category &&
          e.ageCategoryId === bulkAgeCategoryId
      );
      const existingSexes = new Set(sameName.map((e) => e.sex));
      const sexesToCreate = sexesForSexOption(item.sexOption);
      const missingSexes = sexesToCreate.filter((sex) => !existingSexes.has(sex));

      if (missingSexes.length === 0) {
        continue;
      }

      const eligibilityResult = resolveEventCreateEligibility({
        body: item.rawBody,
        targetAgeCategoryId: bulkAgeCategoryId,
        validCategoryIds,
      });
      if (!eligibilityResult.ok) {
        return NextResponse.json({ message: eligibilityResult.message }, { status: 400 });
      }

      const teamResult = parseEventCreateTeamFields(item.rawBody, item.type);
      if (!teamResult.ok) {
        return NextResponse.json({ message: teamResult.message }, { status: 400 });
      }

      const createExtras = {
        ...eligibilityResult.data,
        ...teamResult.data,
      };

      const announce =
        typeof item.announcementMessage === "string"
          ? item.announcementMessage.trim()
          : undefined;
      try {
        assertEventAddAllowed(mutationState, announce);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }

      const requiresEntryTime = item.category === "POOL";

      for (const sex of missingSexes) {
        nextOrder += 1;
        creates.push({
          competitionId,
          ageCategoryId: createExtras.ageCategoryId,
          name: storedName,
          sex,
          type: item.type,
          category: item.category,
          requiresEntryTime,
          displayOrder: nextOrder,
          allowedAgeCategoryIds: createExtras.allowedAgeCategoryIds,
          eligibleBirthDateFrom: createExtras.eligibleBirthDateFrom ?? undefined,
          eligibleBirthDateTo: createExtras.eligibleBirthDateTo ?? undefined,
          minAge: createExtras.minAge ?? undefined,
          maxAge: createExtras.maxAge ?? undefined,
          teamRelayPositionCount: createExtras.teamRelayPositionCount ?? undefined,
          teamRelayPositionNames: createExtras.teamRelayPositionNames ?? undefined,
          maxTeamEntriesPerClub: createExtras.maxTeamEntriesPerClub ?? undefined,
        });
        working.push({
          name: storedName,
          nameLower,
          type: item.type,
          category: item.category,
          sex,
          ageCategoryId: bulkAgeCategoryId,
        });
      }

      if (
        announce &&
        mutationState.isPublished &&
        mutationState.hasEstablishedEntry
      ) {
        announcements.push(announce);
      }
    }

    if (creates.length === 0) {
      return NextResponse.json(
        { message: "追加する種目がありません（すべて登録済みの可能性があります）" },
        { status: 400 }
      );
    }

    await prisma.event.createMany({ data: creates });

    for (const bodyText of announcements) {
      await announceCompetitionRuleChange({
        competitionId,
        title: `${competition.name} に種目が追加されました`,
        body: bodyText,
      });
    }

    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: `${creates.length}件の種目を追加しました`,
      events: updatedEvents,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/events/bulk/route.ts", error);
  }
}
