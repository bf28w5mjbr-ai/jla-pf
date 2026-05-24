import { jsonInternalError500 } from "@/lib/apiInternalError";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  announceCompetitionRuleChange,
  assertEventAddAllowed,
  assertEventAgePatchAllowed,
  assertEventDeletionAllowed,
  CompetitionEditForbiddenError,
  loadCompetitionMutationState,
} from "@/lib/competitionPublishedEditRules";
import { hostOrgAdminCanManageCompetition } from "@/lib/roleScopes";
import {
  hostOrgAdminGateMessageError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { canManageCompetitionStartListSettings } from "@/lib/competitionStartListAccess";
import { verifyDayOpsUnlockFromRequest } from "@/lib/dayOpsUnlockCookie";
import { assertEventScheduleWithinCompetitionRange } from "@/lib/eventScheduleWithinCompetition";
import {
  mergeRoundScheduledStart,
  parseRoundScheduledStarts,
  pruneRoundScheduledStarts,
  roundScheduledStartsToPrismaJson,
} from "@/lib/eventRoundScheduledStarts";
import { syncStartListSettingsRoundTabsForEvent } from "@/lib/startListRoundCountSync";
import { parseEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import { eventBirthFieldsFromAgeCategory } from "@/lib/competitionAgeCategorySync";
import { eventSiblingGroupWhere } from "@/lib/eventSiblingGroup";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await context.params;

    // セッション確認
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireHostOrgAdminForCompetition(competitionId, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateMessageError(e);
      if (gated) {
        return NextResponse.json({ message: gated.message }, { status: gated.status });
      }
      throw e;
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
    });

    if (!event) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }

    const mutationState = await loadCompetitionMutationState(competitionId);
    try {
      assertEventDeletionAllowed(mutationState);
    } catch (e) {
      if (e instanceof CompetitionEditForbiddenError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      throw e;
    }

    // 同一種目名・同一競技区分・同一年齢カテゴリ内の男女行をまとめて削除
    await prisma.event.deleteMany({
      where: eventSiblingGroupWhere(competitionId, event),
    });

    // 更新後の種目一覧を取得
    const updatedEvents = await prisma.event.findMany({
      where: { competitionId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({
      message: "種目を削除しました",
      events: updatedEvents,
    });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/events/[eventId]/route.ts", error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await context.params;

    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    const sessionUserId = session?.userId ?? null;
    const hasDayOpsUnlock = await verifyDayOpsUnlockFromRequest(request, competitionId);

    if (!sessionUserId && !hasDayOpsUnlock) {
      return NextResponse.json({ message: "認証または当日運用アクセスが必要です" }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: sessionUserId ?? "clinvalidnosessionuser0000" },
                },
              },
            },
          },
        },
      },
    });

    if (!event || event.competitionId !== competitionId) {
      return NextResponse.json({ message: "種目が見つかりません" }, { status: 404 });
    }

    const isAdmin = hostOrgAdminCanManageCompetition(event.competition.organization.admins, event.competition.organization.status);

    if (
      !canManageCompetitionStartListSettings({
        orgAdminsForCurrentUser: event.competition.organization.admins,
        orgStatus: event.competition.organization.status,
        hasDayOpsUnlock,
      })
    ) {
      return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const hasPreliminaryLaneKey = Object.prototype.hasOwnProperty.call(
      raw,
      "preliminaryHeatLaneCount"
    );
    const hasStartListRoundCountKey = Object.prototype.hasOwnProperty.call(
      raw,
      "startListRoundCount"
    );
    const rawKeys = Object.keys(raw);
    const isRoundSchedulePatch =
      rawKeys.length === 2 &&
      Object.prototype.hasOwnProperty.call(raw, "scheduleRoundIndex") &&
      Object.prototype.hasOwnProperty.call(raw, "scheduledStartAt");
    const hasSchedulePatch =
      !isRoundSchedulePatch &&
      (Object.prototype.hasOwnProperty.call(raw, "scheduledStartAt") ||
        Object.prototype.hasOwnProperty.call(raw, "scheduledEndAt"));

    const onlyScheduleSort =
      rawKeys.length === 1 && Object.prototype.hasOwnProperty.call(raw, "scheduleTabSortOrder");
    if (onlyScheduleSort) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      const sv = raw.scheduleTabSortOrder;
      if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 0 || sv > 99999) {
        return NextResponse.json(
          { message: "scheduleTabSortOrder は 0〜99999 の整数にしてください" },
          { status: 400 }
        );
      }
      await prisma.event.update({
        where: { id: eventId },
        data: { scheduleTabSortOrder: sv },
      });
      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: [
          { scheduleTabId: "asc" },
          { scheduleTabSortOrder: "asc" },
          { displayOrder: "asc" },
        ],
      });
      return NextResponse.json({
        message: "タイムスケジュール内の並びを更新しました",
        events: updatedEvents,
      });
    }

    if (isRoundSchedulePatch) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      const ri = raw.scheduleRoundIndex;
      if (typeof ri !== "number" || !Number.isInteger(ri) || ri < 0 || ri > 31) {
        return NextResponse.json(
          { message: "scheduleRoundIndex は 0〜31 の整数にしてください" },
          { status: 400 }
        );
      }
      const nRounds =
        typeof event.startListRoundCount === "number" &&
        Number.isInteger(event.startListRoundCount) &&
        event.startListRoundCount >= 1
          ? Math.min(32, event.startListRoundCount)
          : 1;
      if (ri >= nRounds) {
        return NextResponse.json(
          { message: "scheduleRoundIndex はこの種目のラウンド数未満にしてください" },
          { status: 400 }
        );
      }
      const parseOneStart = (v: unknown): Date | null => {
        if (v === null || v === "") return null;
        if (typeof v !== "string") throw new Error("invalid");
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new Error("invalid");
        return d;
      };
      let parsedStart: Date | null;
      try {
        parsedStart = parseOneStart(raw.scheduledStartAt);
      } catch {
        return NextResponse.json({ message: "開始日時の形式が不正です" }, { status: 400 });
      }
      const rangeMsg = assertEventScheduleWithinCompetitionRange(
        parsedStart,
        null,
        event.competition.startDate,
        event.competition.endDate
      );
      if (rangeMsg) {
        return NextResponse.json({ message: rangeMsg }, { status: 400 });
      }

      const nextMap = mergeRoundScheduledStart(
        event.roundScheduledStarts,
        ri,
        parsedStart ? parsedStart.toISOString() : null
      );
      const data: Prisma.EventUpdateInput = {
        roundScheduledStarts: roundScheduledStartsToPrismaJson(nextMap),
      };
      if (ri === 0) {
        data.scheduledStartAt = parsedStart;
      }

      await prisma.event.update({
        where: { id: eventId },
        data,
      });

      const updatedEventsRound = await prisma.event.findMany({
        where: { competitionId },
        orderBy: [
          { scheduleTabId: "asc" },
          { scheduleTabSortOrder: "asc" },
          { displayOrder: "asc" },
        ],
      });
      return NextResponse.json({
        message: "ラウンドの開始日時を更新しました",
        events: updatedEventsRound,
      });
    }

    const scheduleTabKeySet = new Set(["scheduleTabId", "scheduleTabSortOrder"]);
    const onlyScheduleTab =
      rawKeys.length > 0 && rawKeys.every((k) => scheduleTabKeySet.has(k));
    if (onlyScheduleTab) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (!Object.prototype.hasOwnProperty.call(raw, "scheduleTabId")) {
        return NextResponse.json(
          { message: "scheduleTabId を指定してください" },
          { status: 400 }
        );
      }
      const newTabId =
        typeof raw.scheduleTabId === "string" ? raw.scheduleTabId.trim() : "";
      if (!newTabId) {
        return NextResponse.json({ message: "scheduleTabId が不正です" }, { status: 400 });
      }
      const tab = await prisma.competitionScheduleTab.findFirst({
        where: { id: newTabId, competitionId },
      });
      if (!tab) {
        return NextResponse.json({ message: "タブが見つかりません" }, { status: 404 });
      }

      let nextSort: number;
      if (Object.prototype.hasOwnProperty.call(raw, "scheduleTabSortOrder")) {
        const sv = raw.scheduleTabSortOrder;
        if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 0 || sv > 99999) {
          return NextResponse.json(
            { message: "scheduleTabSortOrder は 0〜99999 の整数にしてください" },
            { status: 400 }
          );
        }
        nextSort = sv;
      } else {
        const agg = await prisma.event.aggregate({
          where: { competitionId, scheduleTabId: newTabId },
          _max: { scheduleTabSortOrder: true },
        });
        nextSort = (agg._max.scheduleTabSortOrder ?? 0) + 1;
      }

      await prisma.event.update({
        where: { id: eventId },
        data: { scheduleTabId: newTabId, scheduleTabSortOrder: nextSort },
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: [
          { scheduleTabId: "asc" },
          { scheduleTabSortOrder: "asc" },
          { displayOrder: "asc" },
        ],
      });
      return NextResponse.json({
        message: "タイムスケジュールのタブを更新しました",
        events: updatedEvents,
      });
    }

    const onlyAgeCategoryId =
      rawKeys.length === 1 && Object.prototype.hasOwnProperty.call(raw, "ageCategoryId");
    if (onlyAgeCategoryId) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      const v = raw.ageCategoryId;
      if (v !== null && (typeof v !== "string" || !String(v).trim())) {
        return NextResponse.json(
          { message: "ageCategoryId は文字列 ID または null にしてください" },
          { status: 400 }
        );
      }
      const categoryId = v === null || v === "" ? null : String(v).trim();

      const mutationStateLink = await loadCompetitionMutationState(competitionId);
      try {
        assertEventAgePatchAllowed(mutationStateLink);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }

      if (categoryId) {
        const cat = await prisma.competitionAgeCategory.findFirst({
          where: { id: categoryId, competitionId },
        });
        if (!cat) {
          return NextResponse.json({ message: "年齢カテゴリが見つかりません" }, { status: 404 });
        }
        const birth = eventBirthFieldsFromAgeCategory(cat);
        await prisma.event.updateMany({
          where: eventSiblingGroupWhere(competitionId, event),
          data: {
            ageCategoryId: categoryId,
            ...birth,
          },
        });
      } else {
        await prisma.event.updateMany({
          where: eventSiblingGroupWhere(competitionId, event),
          data: { ageCategoryId: null },
        });
      }

      const updatedEventsLink = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: categoryId
          ? "種目を年齢カテゴリに連動しました（参加可能な生年月日がカテゴリに合わせて更新されました）。"
          : "種目の年齢カテゴリ連動を解除しました。",
        events: updatedEventsLink,
      });
    }

    const onlyName =
      rawKeys.length === 1 && Object.prototype.hasOwnProperty.call(raw, "name");
    if (onlyName) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (typeof raw.name !== "string") {
        return NextResponse.json({ message: "種目名は文字列で指定してください" }, { status: 400 });
      }
      const nextName = raw.name.trim();
      if (!nextName) {
        return NextResponse.json({ message: "種目名を入力してください" }, { status: 400 });
      }
      if (nextName.length > 256) {
        return NextResponse.json(
          { message: "種目名は256文字以内にしてください" },
          { status: 400 }
        );
      }
      if (nextName === event.name) {
        const updatedEventsSame = await prisma.event.findMany({
          where: { competitionId },
          orderBy: { displayOrder: "asc" },
        });
        return NextResponse.json({
          message: "種目名は変更されていません",
          events: updatedEventsSame,
        });
      }

      const siblingRows = await prisma.event.findMany({
        where: eventSiblingGroupWhere(competitionId, event),
        select: { id: true },
      });
      const siblingIdSet = new Set(siblingRows.map((r) => r.id));

      const conflict = await prisma.event.findFirst({
        where: {
          competitionId,
          name: nextName,
          type: event.type,
          category: event.category,
          ageCategoryId: event.ageCategoryId,
          id: { notIn: [...siblingIdSet] },
        },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          {
            message:
              "同じ区分（プール／オーシャン）・個人／団体・年齢カテゴリの組み合わせに、すでにその種目名があります。別の名前にしてください。",
          },
          { status: 400 }
        );
      }

      await prisma.event.updateMany({
        where: eventSiblingGroupWhere(competitionId, event),
        data: { name: nextName },
      });

      const updatedEventsName = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: "種目名を更新しました",
        events: updatedEventsName,
      });
    }

    const hasEligibleBirthFrom = Object.prototype.hasOwnProperty.call(
      raw,
      "eligibleBirthDateFrom"
    );
    const hasEligibleBirthTo = Object.prototype.hasOwnProperty.call(raw, "eligibleBirthDateTo");
    if (hasEligibleBirthFrom !== hasEligibleBirthTo) {
      return NextResponse.json(
        {
          message:
            "参加可能な生年月日を更新する場合は、eligibleBirthDateFrom と eligibleBirthDateTo の両方を送信してください（未設定は null）。",
        },
        { status: 400 }
      );
    }
    const hasBirthDatePair = hasEligibleBirthFrom && hasEligibleBirthTo;

    const hasTeamRelayPositionCountKey = Object.prototype.hasOwnProperty.call(
      raw,
      "teamRelayPositionCount"
    );
    const hasTeamRelayPositionNamesKey = Object.prototype.hasOwnProperty.call(
      raw,
      "teamRelayPositionNames"
    );
    const hasMaxTeamEntriesPerClubKey = Object.prototype.hasOwnProperty.call(
      raw,
      "maxTeamEntriesPerClub"
    );
    const teamSettingsAllowed = new Set([
      "teamRelayPositionCount",
      "teamRelayPositionNames",
      "maxTeamEntriesPerClub",
    ]);
    const hasTeamSettingsPatch = rawKeys.some((k) => teamSettingsAllowed.has(k));
    if (hasTeamSettingsPatch) {
      const disallowedKey = rawKeys.some((k) => !teamSettingsAllowed.has(k));
      if (disallowedKey) {
        return NextResponse.json(
          { message: "チーム種目の設定は他の項目と同時に更新できません" },
          { status: 400 }
        );
      }
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (event.type !== "TEAM") {
        return NextResponse.json(
          { message: "チーム種目以外ではチーム用の設定を保存できません" },
          { status: 400 }
        );
      }

      const parseStoredNames = (v: unknown): string[] => {
        if (v === null || v === undefined) return [];
        if (!Array.isArray(v)) return [];
        return v
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
      };

      const touchingRelay =
        hasTeamRelayPositionCountKey || hasTeamRelayPositionNamesKey;

      let nextCount: number | null | undefined;
      let nextNames: string[] | undefined;
      if (touchingRelay) {
        if (hasTeamRelayPositionCountKey) {
          const v = raw.teamRelayPositionCount;
          if (v === null || v === "") {
            nextCount = null;
          } else if (typeof v === "number" && Number.isInteger(v)) {
            nextCount = v;
          } else if (typeof v === "string" && /^\d+$/.test(v.trim())) {
            nextCount = parseInt(v.trim(), 10);
          } else {
            return NextResponse.json(
              { message: "ポジション数は1〜32の整数、または未設定（空）にしてください" },
              { status: 400 }
            );
          }
          if (nextCount !== null && (nextCount < 1 || nextCount > 32)) {
            return NextResponse.json(
              { message: "ポジション数は1〜32の範囲で指定してください" },
              { status: 400 }
            );
          }
        } else {
          nextCount = event.teamRelayPositionCount ?? null;
        }

        if (hasTeamRelayPositionNamesKey) {
          const v = raw.teamRelayPositionNames;
          if (v === null) {
            nextNames = [];
          } else if (Array.isArray(v)) {
            nextNames = v
              .filter((x): x is string => typeof x === "string")
              .map((s) => s.trim())
              .filter(Boolean);
          } else {
            return NextResponse.json(
              { message: "ポジション名は文字列の配列で指定してください" },
              { status: 400 }
            );
          }
        } else {
          nextNames = parseStoredNames(event.teamRelayPositionNames);
        }

        if (nextCount === null) {
          if (nextNames.length > 0) {
            return NextResponse.json(
              { message: "ポジション数を指定しない場合はポジション名も空にしてください" },
              { status: 400 }
            );
          }
        } else if (nextNames.length !== nextCount) {
          return NextResponse.json(
            {
              message: `ポジション名は${nextCount}件（ポジション数と同じ行数）にしてください`,
            },
            { status: 400 }
          );
        }
      }

      let nextMaxTeamEntriesPerClub: number | null | undefined = undefined;
      if (hasMaxTeamEntriesPerClubKey) {
        const v = raw.maxTeamEntriesPerClub;
        if (v === null || v === "") {
          nextMaxTeamEntriesPerClub = null;
        } else if (typeof v === "number" && Number.isInteger(v)) {
          nextMaxTeamEntriesPerClub = v;
        } else if (typeof v === "string" && /^\d+$/.test(v.trim())) {
          nextMaxTeamEntriesPerClub = parseInt(v.trim(), 10);
        } else {
          return NextResponse.json(
            {
              message:
                "同一クラブあたりのチーム上限は1〜999の整数、または未設定（空・null）にしてください",
            },
            { status: 400 }
          );
        }
        if (
          nextMaxTeamEntriesPerClub !== null &&
          (nextMaxTeamEntriesPerClub < 1 || nextMaxTeamEntriesPerClub > 999)
        ) {
          return NextResponse.json(
            {
              message: "同一クラブあたりのチーム上限は1〜999の範囲で指定してください",
            },
            { status: 400 }
          );
        }

        if (nextMaxTeamEntriesPerClub !== null) {
          const siblingRows = await prisma.event.findMany({
            where: {
              ...eventSiblingGroupWhere(competitionId, event),
              type: "TEAM",
            },
            select: { id: true },
          });
          for (const row of siblingRows) {
            const grouped = await prisma.teamEntry.groupBy({
              by: ["clubId"],
              where: { competitionId, eventId: row.id },
              _count: { _all: true },
            });
            const worst = grouped.reduce((m, g) => Math.max(m, g._count._all), 0);
            if (worst > nextMaxTeamEntriesPerClub) {
              return NextResponse.json(
                {
                  message: `同一クラブあたりの上限を${nextMaxTeamEntriesPerClub}組にすると、すでにそれを超えてエントリーしているクラブがあります（最大${worst}組）。先にエントリーを調整してください。`,
                },
                { status: 400 }
              );
            }
          }
        }
      }

      const data: Prisma.EventUpdateManyMutationInput = {};
      if (touchingRelay && nextCount !== undefined && nextNames !== undefined) {
        const namesValue: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
          nextCount === null ? Prisma.JsonNull : nextNames;
        data.teamRelayPositionCount = nextCount;
        data.teamRelayPositionNames = namesValue;
      }
      if (nextMaxTeamEntriesPerClub !== undefined) {
        data.maxTeamEntriesPerClub = nextMaxTeamEntriesPerClub;
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { message: "更新するチーム種目の設定がありません" },
          { status: 400 }
        );
      }

      await prisma.event.updateMany({
        where: {
          ...eventSiblingGroupWhere(competitionId, event),
          type: "TEAM",
        },
        data,
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      const message =
        touchingRelay && nextMaxTeamEntriesPerClub !== undefined
          ? "チーム種目のポジションと同一クラブあたりのチーム上限を更新しました"
          : touchingRelay
            ? "チーム種目のポジション設定を更新しました"
            : "チーム種目の同一クラブあたりのチーム上限を更新しました";

      return NextResponse.json({
        message,
        events: updatedEvents,
      });
    }

    if (hasStartListRoundCountKey) {
      if (rawKeys.length === 1) {
        return NextResponse.json(
          {
            message:
              "ラウンド数の変更はスタートリスト画面の「一括保存」をご利用ください。",
          },
          { status: 400 }
        );
      }
      if (
        hasPreliminaryLaneKey ||
        hasSchedulePatch ||
        raw.sexOption !== undefined ||
        raw.minAge !== undefined ||
        raw.maxAge !== undefined ||
        hasEligibleBirthFrom ||
        hasEligibleBirthTo
      ) {
        return NextResponse.json(
          {
            message:
              "スタートリストのラウンド数は、レーン・日程・性別・年齢・生年月日範囲の変更と同時に送れません。保存を分けてください。",
          },
          { status: 400 }
        );
      }
      if (!isAdmin) {
        return NextResponse.json(
          {
            message:
              "スタートリストのラウンド数は主催者管理者のみが更新できます",
          },
          { status: 403 }
        );
      }

      const rc = raw.startListRoundCount;
      let nextRound: number;
      if (typeof rc === "number" && Number.isInteger(rc)) {
        nextRound = rc;
      } else if (typeof rc === "string" && /^\d+$/.test(rc.trim())) {
        nextRound = parseInt(rc.trim(), 10);
      } else {
        return NextResponse.json(
          { message: "スタートリストのラウンド数は1〜32の整数にしてください" },
          { status: 400 }
        );
      }
      if (nextRound < 1 || nextRound > 32) {
        return NextResponse.json(
          { message: "スタートリストのラウンド数は1〜32の範囲で指定してください" },
          { status: 400 }
        );
      }

      if (event.marshalStartedAt) {
        return NextResponse.json(
          { message: "マーシャル開始後はスタートリストのラウンド数を変更できません" },
          { status: 409 }
        );
      }

      const pruned = pruneRoundScheduledStarts(
        parseRoundScheduledStarts(event.roundScheduledStarts),
        nextRound
      );

      await prisma.event.update({
        where: { id: eventId },
        data: {
          startListRoundCount: nextRound,
          roundScheduledStarts: roundScheduledStartsToPrismaJson(pruned),
        },
      });
      await syncStartListSettingsRoundTabsForEvent({
        competitionId,
        eventId,
        roundCount: nextRound,
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: "スタートリストのラウンド数を更新しました",
        events: updatedEvents,
      });
    }

    if (hasPreliminaryLaneKey) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (
        Object.prototype.hasOwnProperty.call(raw, "scheduledStartAt") ||
        Object.prototype.hasOwnProperty.call(raw, "scheduledEndAt") ||
        raw.sexOption !== undefined ||
        raw.minAge !== undefined ||
        raw.maxAge !== undefined ||
        hasEligibleBirthFrom ||
        hasEligibleBirthTo
      ) {
        return NextResponse.json(
          {
            message:
              "1レースあたりの最大レーン数の更新は日程・性別・年齢・生年月日範囲の変更と同時に行えません。保存を分けてください。",
          },
          { status: 400 }
        );
      }

      const laneVal = raw.preliminaryHeatLaneCount;
      let nextLanes: number | null;
      if (laneVal === null || laneVal === "") {
        nextLanes = null;
      } else if (typeof laneVal === "number" && Number.isInteger(laneVal)) {
        nextLanes = laneVal;
      } else if (typeof laneVal === "string") {
        const t = laneVal.trim();
        if (t === "") {
          nextLanes = null;
        } else if (/^\d+$/.test(t)) {
          nextLanes = parseInt(t, 10);
        } else {
          return NextResponse.json(
            {
              message:
                "1レースあたりの最大レーン数は1〜32の整数、または未設定（空）にしてください",
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { message: "1レースあたりの最大レーン数は1〜32の整数、または未設定（空）にしてください" },
          { status: 400 }
        );
      }

      if (nextLanes !== null && (nextLanes < 1 || nextLanes > 32)) {
        return NextResponse.json(
          { message: "1レースあたりの最大レーン数は1〜32の範囲で指定してください" },
          { status: 400 }
        );
      }

      if (event.marshalStartedAt) {
        return NextResponse.json(
          { message: "マーシャル開始後は1レースあたりの最大レーン数を変更できません" },
          { status: 409 }
        );
      }

      await prisma.event.update({
        where: { id: eventId },
        data: { preliminaryHeatLaneCount: nextLanes },
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: "種目（性別行）の1レースあたりの最大レーン数を更新しました",
        events: updatedEvents,
      });
    }

    if (hasSchedulePatch) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (
        raw.minAge !== undefined ||
        raw.maxAge !== undefined ||
        raw.sexOption !== undefined ||
        hasEligibleBirthFrom ||
        hasEligibleBirthTo
      ) {
        return NextResponse.json(
          {
            message:
              "日程の更新は性別・年齢・生年月日範囲の変更と同時に行えません。保存を分けてください。",
          },
          { status: 400 }
        );
      }

      const parseScheduleField = (v: unknown): Date | null => {
        if (v === null || v === "") return null;
        if (typeof v !== "string") {
          throw new Error("invalid");
        }
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new Error("invalid");
        return d;
      };

      let nextStart: Date | null | undefined;
      let nextEnd: Date | null | undefined;
      try {
        if (Object.prototype.hasOwnProperty.call(raw, "scheduledStartAt")) {
          nextStart = parseScheduleField(raw.scheduledStartAt);
        }
        if (Object.prototype.hasOwnProperty.call(raw, "scheduledEndAt")) {
          nextEnd = parseScheduleField(raw.scheduledEndAt);
        }
      } catch {
        return NextResponse.json(
          { message: "開始・終了日時の形式が不正です" },
          { status: 400 }
        );
      }

      const current = await prisma.event.findUnique({
        where: { id: eventId },
        select: { scheduledStartAt: true, scheduledEndAt: true, roundScheduledStarts: true },
      });
      const effStart =
        nextStart !== undefined ? nextStart : current?.scheduledStartAt ?? null;
      const effEnd = nextEnd !== undefined ? nextEnd : current?.scheduledEndAt ?? null;
      if (effStart && effEnd && effEnd < effStart) {
        return NextResponse.json(
          { message: "終了日時は開始日時以降にしてください" },
          { status: 400 }
        );
      }

      const rangeMsg = assertEventScheduleWithinCompetitionRange(
        effStart,
        effEnd,
        event.competition.startDate,
        event.competition.endDate
      );
      if (rangeMsg) {
        return NextResponse.json({ message: rangeMsg }, { status: 400 });
      }

      const nextRoundMap =
        nextStart !== undefined
          ? mergeRoundScheduledStart(
              current?.roundScheduledStarts ?? null,
              0,
              nextStart === null ? null : nextStart.toISOString()
            )
          : undefined;

      await prisma.event.update({
        where: { id: eventId },
        data: {
          ...(nextStart !== undefined && { scheduledStartAt: nextStart }),
          ...(nextEnd !== undefined && { scheduledEndAt: nextEnd }),
          ...(nextRoundMap !== undefined && {
            roundScheduledStarts: roundScheduledStartsToPrismaJson(nextRoundMap),
          }),
        },
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: "種目の日程を更新しました",
        events: updatedEvents,
      });
    }

    if (hasBirthDatePair) {
      if (rawKeys.length !== 2) {
        return NextResponse.json(
          {
            message:
              "参加可能な生年月日の範囲を更新するときは、eligibleBirthDateFrom / eligibleBirthDateTo のみを送信してください。",
          },
          { status: 400 }
        );
      }
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      const mutationStateBirth = await loadCompetitionMutationState(competitionId);
      try {
        assertEventAgePatchAllowed(mutationStateBirth);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }

      let fromD: Date | null;
      let toD: Date | null;
      try {
        fromD = parseEligibleBirthDateInput(raw.eligibleBirthDateFrom);
        toD = parseEligibleBirthDateInput(raw.eligibleBirthDateTo);
      } catch {
        return NextResponse.json(
          {
            message:
              "参加可能な生年月日は YYYY-MM-DD 形式で指定してください（解除する場合は null）。",
          },
          { status: 400 }
        );
      }

      if (fromD && toD && fromD.getTime() > toD.getTime()) {
        return NextResponse.json(
          { message: "生年月日の開始は終了以前の日付にしてください。" },
          { status: 400 }
        );
      }

      const clearLegacyAge = Boolean(fromD || toD);

      await prisma.event.updateMany({
        where: eventSiblingGroupWhere(competitionId, event),
        data: {
          eligibleBirthDateFrom: fromD,
          eligibleBirthDateTo: toD,
          ageCategoryId: null,
          ...(clearLegacyAge ? { minAge: null, maxAge: null } : {}),
        },
      });

      const updatedEventsBirth = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: clearLegacyAge
          ? "種目の参加可能な生年月日の範囲を更新しました（従来の歳数指定は解除されました）。"
          : "種目の参加可能な生年月日の範囲を更新しました。",
        events: updatedEventsBirth,
      });
    }

    const body = raw as {
      minAge?: unknown;
      maxAge?: unknown;
      sexOption?: unknown;
      announcementMessage?: unknown;
    };
    const { minAge, maxAge, sexOption, announcementMessage } = body ?? {};

    if (sexOption !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }
      if (
        sexOption !== "BOTH" &&
        sexOption !== "MALE_ONLY" &&
        sexOption !== "FEMALE_ONLY" &&
        sexOption !== "MIXED_ONLY"
      ) {
        return NextResponse.json({ message: "性別指定が不正です" }, { status: 400 });
      }

      if (
        minAge !== undefined ||
        maxAge !== undefined ||
        hasEligibleBirthFrom ||
        hasEligibleBirthTo
      ) {
        return NextResponse.json(
          { message: "性別区分と年齢条件・生年月日範囲は同時に更新できません" },
          { status: 400 }
        );
      }

      const mutationState = await loadCompetitionMutationState(competitionId);
      const announce =
        typeof announcementMessage === "string" ? announcementMessage.trim() : undefined;

      const requestedSexes: Array<"MALE" | "FEMALE" | "OTHER"> =
        sexOption === "MALE_ONLY"
          ? ["MALE"]
          : sexOption === "FEMALE_ONLY"
            ? ["FEMALE"]
            : sexOption === "MIXED_ONLY"
              ? ["OTHER"]
              : ["MALE", "FEMALE"];
      const requestedSexSet = new Set<"MALE" | "FEMALE" | "OTHER">(requestedSexes);

      const sameNameEvents = await prisma.event.findMany({
        where: eventSiblingGroupWhere(competitionId, event),
        orderBy: { displayOrder: "asc" },
      });

      const existingSexes = new Set(sameNameEvents.map((e) => e.sex));
      const sexesToAdd = requestedSexes.filter((sex) => !existingSexes.has(sex));
      const sexesToRemove = sameNameEvents
        .filter(
          (e) =>
            !requestedSexSet.has(e.sex as "MALE" | "FEMALE" | "OTHER")
        )
        .map((e) => e.sex);

      if (sexesToAdd.length === 0 && sexesToRemove.length === 0) {
        const updatedEvents = await prisma.event.findMany({
          where: { competitionId },
          orderBy: { displayOrder: "asc" },
        });
        return NextResponse.json({
          message: "性別区分は変更されていません",
          events: updatedEvents,
        });
      }

      try {
        if (sexesToRemove.length > 0) {
          assertEventDeletionAllowed(mutationState);
        }
        if (sexesToAdd.length > 0) {
          assertEventAddAllowed(mutationState, announce);
        }
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }

      const removeEventIds = sameNameEvents
        .filter(
          (e) =>
            !requestedSexSet.has(e.sex as "MALE" | "FEMALE" | "OTHER")
        )
        .map((e) => e.id);

      if (removeEventIds.length > 0) {
        const [entryItemCount, teamEntryCount, officialResultCount, statusCount, draftCount] =
          await prisma.$transaction([
            prisma.entryItem.count({ where: { eventId: { in: removeEventIds } } }),
            prisma.teamEntry.count({ where: { eventId: { in: removeEventIds } } }),
            prisma.officialResult.count({ where: { eventId: { in: removeEventIds } } }),
            prisma.competitionParticipantStatus.count({
              where: { eventId: { in: removeEventIds } },
            }),
            prisma.competitionResultDraft.count({
              where: { eventId: { in: removeEventIds } },
            }),
          ]);

        if (
          entryItemCount > 0 ||
          teamEntryCount > 0 ||
          officialResultCount > 0 ||
          statusCount > 0 ||
          draftCount > 0
        ) {
          return NextResponse.json(
            {
              message:
                "この種目性別には既存データが紐づいているため変更できません。必要なデータを整理してから再度実行してください。",
            },
            { status: 400 }
          );
        }
      }

      const requiresEntryTime = event.category === "POOL";
      const baseDisplayOrder =
        sameNameEvents.length > 0
          ? Math.min(...sameNameEvents.map((e) => e.displayOrder))
          : event.displayOrder;

      await prisma.$transaction(async (tx) => {
        if (removeEventIds.length > 0) {
          await tx.event.deleteMany({
            where: { id: { in: removeEventIds } },
          });
        }

        for (const [index, sex] of sexesToAdd.entries()) {
          await tx.event.create({
            data: {
              competitionId,
              ageCategoryId: event.ageCategoryId,
              name: event.name,
              sex,
              type: event.type,
              category: event.category,
              requiresEntryTime,
              displayOrder: baseDisplayOrder + index,
              minAge: event.minAge,
              maxAge: event.maxAge,
              eligibleBirthDateFrom: event.eligibleBirthDateFrom,
              eligibleBirthDateTo: event.eligibleBirthDateTo,
              scheduledStartAt: event.scheduledStartAt,
              scheduledEndAt: event.scheduledEndAt,
              preliminaryHeatLaneCount: event.preliminaryHeatLaneCount,
              startListRoundCount: event.startListRoundCount,
              teamRelayPositionCount: event.teamRelayPositionCount,
              teamRelayPositionNames: event.teamRelayPositionNames ?? undefined,
              maxTeamEntriesPerClub: event.maxTeamEntriesPerClub ?? null,
            },
          });
        }
      });

      if (announce && mutationState.isPublished && mutationState.hasEstablishedEntry) {
        await announceCompetitionRuleChange({
          competitionId,
          title: `${event.competition.name} の種目性別区分が変更されました`,
          body: announce,
        });
      }

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      const sexLabel =
        sexOption === "BOTH"
          ? "男子・女子"
          : sexOption === "MALE_ONLY"
            ? "男子"
            : sexOption === "FEMALE_ONLY"
              ? "女子"
              : "混合";

      return NextResponse.json({
        message: `種目の性別区分を${sexLabel}に更新しました`,
        events: updatedEvents,
      });
    }

    if (raw.minAge !== undefined || raw.maxAge !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ message: "権限がありません" }, { status: 403 });
      }

      const mutationState = await loadCompetitionMutationState(competitionId);
      try {
        assertEventAgePatchAllowed(mutationState);
      } catch (e) {
        if (e instanceof CompetitionEditForbiddenError) {
          return NextResponse.json({ message: e.message }, { status: 400 });
        }
        throw e;
      }

      if (minAge !== null && minAge !== undefined && (typeof minAge !== "number" || minAge < 0)) {
        return NextResponse.json({ message: "最小年齢が不正です" }, { status: 400 });
      }

      if (maxAge !== null && maxAge !== undefined && (typeof maxAge !== "number" || maxAge < 0)) {
        return NextResponse.json({ message: "最大年齢が不正です" }, { status: 400 });
      }

      if (
        minAge !== null &&
        minAge !== undefined &&
        maxAge !== null &&
        maxAge !== undefined &&
        minAge > maxAge
      ) {
        return NextResponse.json({ message: "最小年齢は最大年齢以下にしてください" }, { status: 400 });
      }

      await prisma.event.updateMany({
        where: eventSiblingGroupWhere(competitionId, event),
        data: {
          minAge: minAge === undefined ? undefined : minAge,
          maxAge: maxAge === undefined ? undefined : maxAge,
          eligibleBirthDateFrom: null,
          eligibleBirthDateTo: null,
        },
      });

      const updatedEvents = await prisma.event.findMany({
        where: { competitionId },
        orderBy: { displayOrder: "asc" },
      });

      return NextResponse.json({
        message: "種目の年齢条件を更新しました（生年月日の範囲指定は解除されました）。",
        events: updatedEvents,
      });
    }

    return NextResponse.json({ message: "更新対象のフィールドがありません" }, { status: 400 });
  } catch (error) {
    return jsonInternalError500("PATCH api/competitions/[id]/events/[eventId]/route.ts", error);
  }
}
