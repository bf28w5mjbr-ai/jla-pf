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

type BulkItem = {
  name: string;
  type: EventType;
  category: EventCategory;
  sexOption: "BOTH" | "MALE_ONLY" | "FEMALE_ONLY" | "MIXED_ONLY";
  announcementMessage?: string;
};

type WorkingEvent = {
  name: string;
  nameLower: string;
  type: EventType;
  category: EventCategory;
  sex: Sex;
  ageCategoryId: string | null;
};

function sexesForOption(
  sexOption: BulkItem["sexOption"]
): ReadonlyArray<"MALE" | "FEMALE" | "OTHER"> {
  if (sexOption === "MALE_ONLY") return ["MALE"] as const;
  if (sexOption === "FEMALE_ONLY") return ["FEMALE"] as const;
  if (sexOption === "MIXED_ONLY") return ["OTHER"] as const;
  return ["MALE", "FEMALE"] as const;
}

function parseItem(raw: unknown): BulkItem | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "種目の指定が不正です" };
  }
  const o = raw as Record<string, unknown>;
  const name = o.name;
  const type = o.type ?? "INDIVIDUAL";
  const category = o.category ?? "POOL";
  const sexOption = o.sexOption ?? "BOTH";

  if (!name || typeof name !== "string" || !name.trim()) {
    return { error: "種目名を入力してください" };
  }
  if (type !== "INDIVIDUAL" && type !== "TEAM") {
    return { error: "種目タイプが不正です" };
  }
  if (category !== "POOL" && category !== "OCEAN") {
    return { error: "競技カテゴリが不正です" };
  }
  if (
    sexOption !== "BOTH" &&
    sexOption !== "MALE_ONLY" &&
    sexOption !== "FEMALE_ONLY" &&
    sexOption !== "MIXED_ONLY"
  ) {
    return { error: "性別指定が不正です" };
  }

  return {
    name: name.trim(),
    type,
    category,
    sexOption,
    announcementMessage:
      typeof o.announcementMessage === "string" ? o.announcementMessage : undefined,
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

    const birthForCreate = resolvedBulkAgeCategory
      ? {
          eligibleBirthDateFrom: resolvedBulkAgeCategory.eligibleBirthDateFrom,
          eligibleBirthDateTo: resolvedBulkAgeCategory.eligibleBirthDateTo,
          minAge: null as number | null,
          maxAge: null as number | null,
        }
      : {};

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
      const sexesToCreate = sexesForOption(item.sexOption);
      const missingSexes = sexesToCreate.filter((sex) => !existingSexes.has(sex));

      if (missingSexes.length === 0) {
        continue;
      }

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
          ageCategoryId: bulkAgeCategoryId,
          name: storedName,
          sex,
          type: item.type,
          category: item.category,
          requiresEntryTime,
          displayOrder: nextOrder,
          ...birthForCreate,
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
